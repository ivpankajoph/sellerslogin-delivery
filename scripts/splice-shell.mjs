import fs from "fs";

const file = "c:/office-work/sellerslogin-delivery/features/delivery-system/index.tsx";
let src = fs.readFileSync(file, "utf8");
if (!src.includes("import { ShellFrame }")) {
  src = src.replace(
    'import { Button } from \'@/components/ui/button\'',
    "import { ShellFrame } from '@/components/shell-frame'\nimport { Button } from '@/components/ui/button'"
  );
}

const shellStart = src.indexOf("export function DeliveryWorkspaceShell");
const menuStart = src.indexOf("<SidebarMenu>", src.indexOf("<SidebarContent", shellStart));
const menuEnd = src.indexOf("</SidebarMenu>", menuStart) + "</SidebarMenu>".length;
let menu = src.slice(menuStart, menuEnd);
menu = menu.replaceAll(
  "hover:bg-teal-50 hover:text-teal-800 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-800 data-[state=open]:bg-teal-50 data-[state=open]:text-teal-800 data-[state=open]:hover:bg-teal-50 data-[state=open]:hover:text-teal-800",
  "hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
);
menu = menu.replaceAll(
  "hover:bg-teal-50 hover:text-teal-800 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-800",
  "hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
);

const returnStart = src.indexOf("  return (", shellStart);
const dashboardStart = src.indexOf("export function DeliverySystemDashboard");
const replacement = `  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:5173'

  return (
    <ShellFrame
      toolbar={
        isAdmin ? (
          <div className='rounded-full bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground'>
            Admin delivery workspace
          </div>
        ) : (
          <button
            type='button'
            onClick={() => {
              window.location.href = adminUrl + '/credits'
            }}
            className='hidden items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-left sm:flex'
          >
            <WalletIcon className='size-4 text-primary' />
            <span className='text-xs font-semibold'>
              {walletBalance !== null ? walletBalance.toLocaleString('en-IN') + ' credits' : '...'}
            </span>
          </button>
        )
      }
      sidebar={
        <>
          ${menu}
        </>
      }
    >
      {children}
    </ShellFrame>
  )
}

`;

src = src.slice(0, returnStart) + replacement + src.slice(dashboardStart);
fs.writeFileSync(file, src);
console.log("shell spliced", menu.length);
