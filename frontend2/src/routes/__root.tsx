import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { AppShell } from "@/components/clinical/app-shell";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center font-mono">
        <div className="text-[10px] uppercase tracking-[0.18em] text-signal-amber mb-3">ERR · ROUTE_NOT_FOUND</div>
        <h1 className="text-7xl font-semibold text-foreground tabular-nums">404</h1>
        <h2 className="mt-4 text-sm uppercase tracking-[0.16em] text-foreground">Page not found</h2>
        <p className="mt-2 text-xs text-muted-foreground font-sans">
          The requested workspace path does not resolve.
        </p>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center border border-signal-cyan/40 bg-signal-cyan/10 px-4 h-9 text-[11px] uppercase tracking-[0.16em] text-signal-cyan hover:bg-signal-cyan/20"
          >
            Return to overview
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Laparoscopy Assistant — Clinical Workstation" },
      { name: "description", content: "Surgical video analytics workstation. Cases, processing jobs, timelines, and reports." },
      { name: "author", content: "Laparoscopy Assistant" },
      { property: "og:title", content: "Laparoscopy Assistant" },
      { property: "og:description", content: "Surgical video analytics workstation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const isStandalone =
    path === "/" ||
    path === "/login" ||
    path === "/signup" ||
    path === "/forgot-password" ||
    path === "/reset-password";

  return (
    <QueryClientProvider client={queryClient}>
      {isStandalone ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
