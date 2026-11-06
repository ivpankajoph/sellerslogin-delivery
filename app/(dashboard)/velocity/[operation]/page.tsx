import { notFound } from "next/navigation"
import { VelocityFeaturePage } from "@/features/velocity/feature-page"
import { isVelocityOperation, velocityNavigation } from "@/features/velocity/navigation"

export function generateStaticParams() {
  return velocityNavigation.map(({ id }) => ({ operation: id }))
}

export default async function VelocityOperationPage({ params }: { params: Promise<{ operation: string }> }) {
  const { operation } = await params
  if (!isVelocityOperation(operation)) notFound()
  return <VelocityFeaturePage operation={operation} />
}
