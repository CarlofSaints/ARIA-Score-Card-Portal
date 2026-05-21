import { TenantProvider } from "@/contexts/TenantContext";
import AppShell from "@/components/AppShell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantProvider>
      <AppShell>{children}</AppShell>
    </TenantProvider>
  );
}
