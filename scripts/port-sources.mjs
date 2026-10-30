import fs from "fs";
import path from "path";

const root = path.resolve("c:/office-work/sellerslogin-delivery");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "scripts") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const file of walk(root)) {
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  const needsParams = content.includes("Route.useParams");
  content = content.replace(/Route\.useParams\(\)/g, "useParams()");
  content = content.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@tanstack\/react-router['"]\s*;?/g,
    (_, names) => {
      const parts = names
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && part !== "createFileRoute");
      if (needsParams && !parts.includes("useParams")) parts.push("useParams");
      if (!parts.length) return "";
      return `import { ${[...new Set(parts)].join(", ")} } from '@/lib/router'\n`;
    }
  );
  const componentNames = [];
  content = content.replace(
    /export const Route = createFileRoute\([\s\S]*?\)\(\{\s*component:\s*(\w+),?\s*\}\)\s*/g,
    (_, name) => {
      componentNames.push(name);
      return "";
    }
  );
  for (const name of componentNames) {
    content = content.replace(
      new RegExp(`(?<!export )function ${name}\\(`),
      `export function ${name}(`
    );
  }
  content = content.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/layout\/sidebar-visibility['"]\s*;?/g,
    "import {$1} from '@/lib/sidebar-type'"
  );
  content = content.replaceAll("import.meta.env.VITE_PUBLIC_API_URL", "process.env.NEXT_PUBLIC_API_URL");
  content = content.replaceAll("import.meta.env.VITE_GOOGLE_MAPS_API_KEY", "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  if (file.endsWith(".tsx") && !content.startsWith('"use client"') && !content.startsWith("'use client'")) {
    content = `"use client"\n\n${content}`;
  }
  if (content !== original) fs.writeFileSync(file, content);
}

const buttonPath = path.join(root, "components/ui/button.tsx");
let button = fs.readFileSync(buttonPath, "utf8");
button = button.replace("rounded-none", "rounded-lg");
button = button.replace(
  `className={removeHoverUtilities(
        cn(buttonVariants({ variant, size, className }))
      )}`,
  "className={cn(buttonVariants({ variant, size, className }))}"
);
button = button.replace(
  `outline:
          'border border-black bg-white text-black shadow-sm',`,
  `outline:
          'border border-border bg-background text-foreground shadow-sm hover:bg-muted',`
);
fs.writeFileSync(buttonPath, button);

const badgePath = path.join(root, "components/ui/badge.tsx");
let badge = fs.readFileSync(badgePath, "utf8");
badge = badge.replace("rounded-none", "rounded-md");
fs.writeFileSync(badgePath, badge);

const cardPath = path.join(root, "components/ui/card.tsx");
let card = fs.readFileSync(cardPath, "utf8");
card = card.replaceAll("rounded-none", "rounded-xl");
fs.writeFileSync(cardPath, card);

console.log("ported");
