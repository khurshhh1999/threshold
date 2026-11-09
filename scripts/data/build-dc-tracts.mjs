import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import shapefile from 'shapefile'
import Papa from 'papaparse'
import simplify from '@turf/simplify'
import centroid from '@turf/centroid'

const cache = path.resolve('.cache')
const output = path.resolve('src/data/generated')
const leadUrl = 'https://data.openei.org/files/6219/DC-2022-LEAD-data.zip'
const tractUrl = 'https://www2.census.gov/geo/tiger/GENZ2022/shp/cb_2022_11_tract_500k.zip'
await mkdir(cache, { recursive: true })
await mkdir(output, { recursive: true })
async function download(name, url) {
  const dest = path.join(cache, name)
  try { return await readFile(dest) } catch {}
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(dest, buffer)
  return buffer
}
const leadZip = new AdmZip(await download('dc-lead.zip', leadUrl))
const entries = leadZip.getEntries().filter(entry => /AMI.*Census.*Tract.*\.csv$/i.test(entry.entryName))
if (entries.length !== 1) throw new Error(`Expected one AMI tract CSV; found ${entries.length}: ${leadZip.getEntries().map(e => e.entryName).join(', ')}`)
const csv = entries[0].getData().toString('utf8')
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true })
if (parsed.errors.length) throw new Error(`CSV parse errors: ${parsed.errors.slice(0, 3).map(e => e.message).join('; ')}`)
const headers = parsed.meta.fields ?? []
const bracketColumn = headers.find(header => /^AMI/i.test(header))
const required = ['FIP','UNITS','HINCP*UNITS','ELEP*UNITS','GASP*UNITS','FULP*UNITS']
if (!bracketColumn || required.some(header => !headers.includes(header))) throw new Error(`Missing columns: ${headers.join(', ')}`)
const bracketOf = value => {
  const label = String(value).replace(/\s/g, '').toUpperCase()
  if (/^0-30%/.test(label)) return 'b0_30'
  if (/^30-60%/.test(label)) return 'b30_60'
  if (/^60-80%/.test(label)) return 'b60_80'
  if (/^80-100%/.test(label)) return 'b80_100'
  if (/^(100-150%|150%\+|100%\+)/.test(label)) return 'b100_plus'
  throw new Error(`Unmatched bracket: ${value}`)
}
const sums = new Map()
for (const row of parsed.data) {
  const geoid = String(row.FIP).padStart(11, '0')
  const bracket = bracketOf(row[bracketColumn])
  if (!sums.has(geoid)) sums.set(geoid, {})
  const data = sums.get(geoid)
  if (!data[bracket]) data[bracket] = { units: 0, income: 0, elec: 0, gas: 0, other: 0 }
  const bucket = data[bracket]
  bucket.units += Number(row.UNITS) || 0
  bucket.income += Number(row['HINCP*UNITS']) || 0
  bucket.elec += Number(row['ELEP*UNITS']) || 0
  bucket.gas += Number(row['GASP*UNITS']) || 0
  bucket.other += Number(row['FULP*UNITS']) || 0
}
const low = ['b0_30','b30_60','b60_80']
const totals = [...sums.values()].flatMap(data => low.map(k => data[k]).filter(Boolean)).reduce((acc, b) => ({ income:acc.income+b.income, cost:acc.cost+b.elec+b.gas+b.other }), {income:0,cost:0})
let burden = totals.cost / totals.income
const costsWereMonthly = burden < 0.025
if (costsWereMonthly) {
  for (const data of sums.values()) for (const bucket of Object.values(data)) { bucket.elec *= 12; bucket.gas *= 12; bucket.other *= 12 }
  burden *= 12
}
if (!(burden >= 0.03 && burden <= 0.25)) throw new Error(`Unexpected DC burden: ${burden}`)
const tractZip = new AdmZip(await download('dc-tracts.zip', tractUrl))
for (const extension of ['shp','dbf']) {
  const entry = tractZip.getEntries().find(item => item.entryName.endsWith(`.${extension}`))
  if (!entry) throw new Error(`Missing ${extension} in tract ZIP`)
  await writeFile(path.join(cache,`dc-tracts.${extension}`),entry.getData())
}
const source = await shapefile.open(path.join(cache,'dc-tracts.shp'),path.join(cache,'dc-tracts.dbf'))
const geometries = new Map()
while (true) {
  const {value,done} = await source.read()
  if (done) break
  geometries.set(String(value.properties.GEOID),value)
}
const round = n => Math.round(n*100000)/100000
const roundCoords = coords => typeof coords[0] === 'number' ? coords.map(round) : coords.map(roundCoords)
const features = []
const tracts = {}
for (const [geoid,data] of sums) {
  const feature = geometries.get(geoid)
  if (!feature || !Object.values(data).some(b => b.units > 0)) continue
  const props = { geoid, name: feature.properties.NAMELSAD }
  const shape = simplify(feature, { tolerance: 0.0003, highQuality: true })
  shape.geometry.coordinates = roundCoords(shape.geometry.coordinates)
  features.push({ type:'Feature', properties:props, geometry:shape.geometry })
  const center = centroid(feature).geometry.coordinates.map(round)
  const brackets = {}
  for (const [key,b] of Object.entries(data)) brackets[key] = {units:Math.round(b.units),avgIncome:b.units?Math.round(b.income/b.units):0,avgElec:b.units?Math.round(b.elec/b.units):0,avgGas:b.units?Math.round(b.gas/b.units):0,avgOther:b.units?Math.round(b.other/b.units):0}
  const lowBuckets = low.map(k => data[k]).filter(Boolean)
  const income = lowBuckets.reduce((n,b)=>n+b.income,0)
  const cost = lowBuckets.reduce((n,b)=>n+b.elec+b.gas+b.other,0)
  tracts[geoid] = { name:props.name, centroid:center, brackets, lowIncomeUnits:Math.round(lowBuckets.reduce((n,b)=>n+b.units,0)),lowIncomeBurden:income?Math.round(cost/income*10000)/10000:0 }
}
const eligible = [...sums].filter(([,data])=>Object.values(data).some(b=>b.units>0)).length
if (features.length / eligible < .95) throw new Error(`Join rate ${features.length}/${eligible} below 95%`)
let geo = JSON.stringify({type:'FeatureCollection',features})
if (Buffer.byteLength(geo)>600000) {
  features.length=0
  for (const geoid of Object.keys(tracts)) {
    const feature = geometries.get(geoid)
    const shape = simplify(feature,{tolerance:.0006,highQuality:true})
    shape.geometry.coordinates=roundCoords(shape.geometry.coordinates)
    features.push({type:'Feature',properties:{geoid,name:feature.properties.NAMELSAD},geometry:shape.geometry})
  }
  geo=JSON.stringify({type:'FeatureCollection',features})
}
if (Buffer.byteLength(geo)>600000) throw new Error(`Geometry too large: ${Buffer.byteLength(geo)}`)
await writeFile(path.join(output,'dc-tracts.geo.json'),geo)
await writeFile(path.join(output,'dc-tract-stats.json'),JSON.stringify({meta:{source:'U.S. DOE LEAD Tool 2022',url:leadUrl,license:'CC BY 4.0',retrieved:'2026-11-09',costsWereMonthly},tracts}))
console.log({tracts:features.length,joined:features.length,eligible,burden,geometryBytes:Buffer.byteLength(geo)})
