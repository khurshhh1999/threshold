# Data sources

Threshold uses public data for the map and synthetic records for the household workflow. No household shown in the demo is a real person.

| Dataset | Publisher | Source | Use |
| --- | --- | --- | --- |
| LEAD Tool 2022, DC tract data | U.S. Department of Energy | [DC download](https://data.openei.org/files/6219/DC-2022-LEAD-data.zip) | Income bracket counts and average energy costs by census tract |
| 2022 DC cartographic census tracts | U.S. Census Bureau | [DC boundary download](https://www2.census.gov/geo/tiger/GENZ2022/shp/cb_2022_11_tract_500k.zip) | Simplified map outlines and tract centroids |
| 2026 poverty guidelines | U.S. Department of Health and Human Services | [HHS guidelines](https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines) | Income limits for program rules |
| LIHEAP state median income | Administration for Children and Families | [FFY 2027 guidance](https://www.hhs.gov/guidance/document/liheap-im2026-01-federal-poverty-guidelines-fpg-and-state-median-income-smi-estimates) | 60% SMI limits for DC |
| Income qualified program table | DCSEU | [Qualification page](https://www.dcseu.com/homeowners-renters/qualify) | DC 80% AMI limits |

The LEAD and Census files were retrieved on November 9, 2026. The build script joins them by 11-digit tract GEOID and writes the processed files in `src/data/generated/`. It includes 204 tracts, checks the join rate, and rejects implausible District-wide energy burden values. The geometry is simplified for fast loading. The map shows low-income energy burden, calculated as average annual energy costs divided by average annual household income for the LEAD brackets below 80% AMI. These are tract-level estimates, not household determinations.

Data: U.S. DOE LEAD Tool 2022 (Ma & Vimont, 2024), CC BY 4.0, doi:10.25984/2504170. Census cartographic boundaries are public domain.
