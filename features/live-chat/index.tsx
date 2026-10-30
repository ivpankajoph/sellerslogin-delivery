"use client";

const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:5173";

export function LiveChatPage() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-base font-semibold">Live chat stays in the main SellersLogin admin</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Delivery tickets are handled here. Open the main admin to continue an existing live chat conversation.
      </p>
      <a href={`${adminUrl}/user-conversation`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Open live chat
      </a>
    </div>
  );
}
