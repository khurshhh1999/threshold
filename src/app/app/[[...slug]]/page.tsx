import { Suspense } from 'react'
import Workbench from '@/components/workbench'
export default function AppPage() { return <Suspense fallback={<div>Loading workbench…</div>}><Workbench/></Suspense> }
