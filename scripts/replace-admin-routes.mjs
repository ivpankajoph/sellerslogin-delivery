import fs from "fs";
import path from "path";

const root = "c:/office-work/sellerslogin-admin/src/routes/_authenticated";

const routes = [
  ["delivery-system.tsx", "/_authenticated/delivery-system", "'/delivery-system'"],
  ["courier/index.tsx", "/_authenticated/courier/", "'/courier'"],
  ["courier/list.tsx", "/_authenticated/courier/list", "'/courier/list'"],
  ["courier/manual.tsx", "/_authenticated/courier/manual", "'/courier/manual'"],
  ["courier/manual-list.tsx", "/_authenticated/courier/manual-list", "'/courier/manual-list'"],
  ["courier/reports.tsx", "/_authenticated/courier/reports", "'/courier/reports'"],
  ["courier/tracking.tsx", "/_authenticated/courier/tracking", "'/courier/tracking'"],
  ["courier/warehouses.tsx", "/_authenticated/courier/warehouses", "'/courier/warehouses'"],
  ["courier/delhivery.tsx", "/_authenticated/courier/delhivery", "'/courier/delhivery'"],
  ["courier/book-vehicle.tsx", "/_authenticated/courier/book-vehicle", "'/courier/book-vehicle'"],
];

const fileFor = (routeId, target) => `import { createFileRoute } from '@tanstack/react-router'
import { openDeliveryApp } from '@/lib/delivery-app'

export const Route = createFileRoute('${routeId}')({
  beforeLoad: () => {
    openDeliveryApp(${target})
  },
  component: () => null,
})
`;

for (const [file, routeId, target] of routes) {
  fs.writeFileSync(path.join(root, file), fileFor(routeId, target));
}

fs.writeFileSync(
  path.join(root, "delivery-system_.book.$serviceId.tsx"),
  `import { createFileRoute } from '@tanstack/react-router'
import { openDeliveryApp } from '@/lib/delivery-app'

export const Route = createFileRoute('/_authenticated/delivery-system_/book/$serviceId')({
  beforeLoad: ({ params }) => {
    openDeliveryApp(\`/delivery-system/book/\${params.serviceId}\`)
  },
  component: () => null,
})
`
);

fs.writeFileSync(
  path.join(root, "courier/$partner.tsx"),
  `import { createFileRoute } from '@tanstack/react-router'
import { openDeliveryApp } from '@/lib/delivery-app'

export const Route = createFileRoute('/_authenticated/courier/$partner')({
  beforeLoad: ({ params }) => {
    openDeliveryApp(\`/courier/\${params.partner}\`)
  },
  component: () => null,
})
`
);

console.log("routes replaced");
