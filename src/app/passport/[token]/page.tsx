export const instant = false
import { seed } from '@/lib/engine'
import LocalPassport from '@/components/local-passport'
import PassportView from '@/components/passport-view'

export default async function Passport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const household = seed().find((x) => x.id.toLowerCase() === token.toLowerCase())
  return household ? <PassportView household={household} /> : <LocalPassport token={token} />
}
