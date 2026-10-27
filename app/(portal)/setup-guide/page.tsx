// Static KAM guide. Keep in step with docs/new-client-setup-guide.html (source of the PDF).

const PDF = "/guides/ARIA-New-Client-Setup-Guide.pdf";

function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[var(--color-primary)]">{children}</span>;
}

function Step({ n, title, by, children }: { n?: number; title: string; by?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
      <h2 className="flex items-center gap-3 bg-[var(--color-primary)] text-white px-5 py-3 text-base font-semibold">
        {n != null && (
          <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-sm flex items-center justify-center">{n}</span>
        )}
        <span className="flex-1">{title}</span>
        {by && <span className="text-xs font-normal opacity-90">{by}</span>}
      </h2>
      <div className="px-5 py-4 space-y-3 text-sm text-[var(--color-text)] leading-relaxed">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="text-left bg-[var(--color-secondary)] text-white px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--color-border)] align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg)] border-l-4 border-[var(--color-secondary)] rounded px-4 py-2">{children}</div>
  );
}

export default function SetupGuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-[var(--color-accent)] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Setting up a new client</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-2xl">
            A new client takes about 30 minutes. No new SQL work is needed if the client already exists in SQL and
            sells only in PnP, SPAR, Builders, Game, Makro or Shoprite Checkers.
          </p>
        </div>
        <a
          href={PDF}
          download
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90"
        >
          Download PDF
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-white rounded-lg border-l-4 border-[var(--color-primary)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">Your ARIA admin does</p>
          Step 1: create the client
        </div>
        <div className="bg-white rounded-lg border-l-4 border-[var(--color-accent)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">The KAM does</p>
          Steps 2 to 5: data, users, mapping, checks
        </div>
      </div>

      <Step title="Before you start">
        <p>Get these together first. Step 1 can&apos;t be finished without them.</p>
        <Table
          head={["What", "Example", "Where to get it"]}
          rows={[
            ["Client name as it appears in SQL", "HENKEL", "It shows in the SQL Server Client list in Step 1. Not there? Ask your ARIA admin to have it added first."],
            ["Display name for the portal", "Henkel", "The client"],
            ["Web address", "henkel.ariascorecard.co.za", "Agree with your ARIA admin"],
            ["Brand colours as HEX codes", "#E1000F", "The client's brand guide or website"],
            ["Logo", "PNG file", "The client"],
            ["Who will be the client admin", "Usually you, the KAM", ""],
            ["KPI weightings (must add up to 100)", "Defaults are fine to start", "The client"],
            ["The KAMs, and the chains and brands each one looks after", "Thandi: PnP and SPAR, all brands", "Your manager"],
          ]}
        />
      </Step>

      <Step n={1} title="Create the client" by="ARIA admin">
        <p>
          Only an ARIA admin can create a client, because this step decides whose data the portal can see.{" "}
          <b>KAM:</b> send your ARIA admin everything from the table above.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Sign in to the ARIA admin area.</li>
          <li>Click <Ui>New Client</Ui>.</li>
          <li>
            Under <Ui>Client Details</Ui>:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>Type the <Ui>Client Name</Ui>. The <Ui>Slug</Ui> fills itself in.</li>
              <li>In <Ui>Custom Domains</Ui>, type the web address.</li>
              <li>In <Ui>SQL Server Client</Ui>, pick the client. This one field links the portal to its data. Never leave it on &quot;No SQL mapping&quot;.</li>
            </ul>
          </li>
          <li>Under <Ui>Branding</Ui>, enter the <Ui>Primary Colour</Ui>, the other colours if they have them, then <Ui>Choose File</Ui> for the logo.</li>
          <li>Under <Ui>Modules</Ui>, untick anything the client hasn&apos;t paid for.</li>
          <li>Under <Ui>KPI Weightings</Ui>, move the sliders until the total says <b>100 / 100</b> in green.</li>
          <li>Under <Ui>Initial Admin User</Ui>, enter the KAM&apos;s name, email and a temporary password. Leave both boxes ticked.</li>
          <li>Click <Ui>Create Client</Ui>.</li>
          <li>Your ARIA admin switches on the web address. The portal won&apos;t open at its address until this is done.</li>
        </ol>
        <p>The KAM gets a welcome email with their login.</p>
      </Step>

      <Step n={2} title="Load the data" by="KAM">
        <p>
          No data shows until the first sync has run. You never pick SQL queries: the portal runs the same ones for
          every client, filtered by the client name chosen in Step 1.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Open the welcome email, sign in at the client&apos;s web address and set your own password.</li>
          <li>In the left menu, click <Ui>Control Centre</Ui>.</li>
          <li>Click <Ui>Sync All</Ui> and <b>wait for it to finish</b>. Sales alone can take about 2 minutes. Don&apos;t close the tab.</li>
          <li>Read the result under the buttons. Each part shows how many rows it pulled. If a part failed, send that line to your ARIA admin.</li>
          <li>
            Optional, for last year&apos;s sales: under <Ui>What to sync</Ui>, tick <Ui>Full months (LY) backfill</Ui>, then click{" "}
            <Ui>Sync Now</Ui>. Each run pulls 2 months. When it says &quot;run again to continue&quot;, click <Ui>Sync Now</Ui> again.
          </li>
          <li>
            Set the auto-sync: under <Ui>Add a time</Ui>, pick an hour (SA time) and click <Ui>+ Add</Ui>. Add as many as you
            want, then click <Ui>Save Schedule</Ui>.
          </li>
        </ol>
        <Tip>With no times saved, the data only updates when someone clicks Sync Now.</Tip>
      </Step>

      <Step n={3} title="Add the users" by="KAM">
        <p>Give every KAM the <b>KAM</b> role. Only KAM users can be picked in Step 4.</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>In the left menu, click <Ui>Admin</Ui>, then <Ui>+ New User</Ui>.</li>
          <li>Fill in <Ui>Name</Ui>, <Ui>Email</Ui>, a temporary <Ui>Password</Ui> and the <Ui>Role</Ui>.</li>
          <li>Leave <Ui>Send welcome email with credentials</Ui> ticked and click <Ui>Create User</Ui>.</li>
        </ol>
        <Table
          head={["Role", "Who gets it", "What they can do"]}
          rows={[
            [<b key="a">Admin</b>, "The KAM who runs this client", "Everything in this guide"],
            [<b key="c">KAM</b>, "Each KAM", "Their own scorecard and the KPI pages"],
            [<b key="m">Manager</b>, "Client managers", "View scorecards and KPI pages"],
            [<b key="r">Rep</b>, "Field reps", "View only what their role allows"],
          ]}
        />
        <Tip>
          The Admin login isn&apos;t a KAM, so it can&apos;t have its own KAM scorecard. If the KAM running the client also
          needs one, add them again with the KAM role, using a different email address.
        </Tip>
      </Step>

      <Step n={4} title="KAM Mapping" by="KAM">
        <p>
          This tells the portal which chains and brands belong to each KAM. It drives the KAM scorecard and the KAM
          filter on every page. Do it after Step 2: the chain and brand lists come from the first sync.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>In the left menu, click <Ui>KAM Mapping</Ui>, then <Ui>+ Add Mapping</Ui>.</li>
          <li>In <Ui>KAM</Ui>, pick the KAM.</li>
          <li>Tick their <Ui>Channels</Ui> (chains) and <Ui>Brands</Ui>, then click <Ui>Save Mapping</Ui>.</li>
          <li>Repeat for each KAM.</li>
        </ol>
      </Step>

      <Step n={5} title="Check it worked" by="KAM">
        <p>
          Open <b>Sales</b>, <b>Out of Stocks</b>, <b>Numerical Distribution</b> and <b>Phantom Stock</b>. Each should show
          rows for the client. Then open a scorecard and pick a KAM from the filter.
        </p>
        <Table
          head={["What you see", "Why", "What to do"]}
          rows={[
            ["Every page is empty", "No sync has run, or the client isn't linked to SQL", "Run Sync All. Still empty: ask your ARIA admin to check the client link."],
            ["One chain is missing", "The client doesn't sell there, or there is no data for it yet", "Check the Sync All result for that chain. Send the error to your ARIA admin."],
            ["Phantom is empty for one chain", "The portal can't read that chain's phantom data yet", "Ask your ARIA admin."],
            ["Client sells in a chain we don't have (e.g. Clicks)", "That chain isn't in the portal yet", "Ask your ARIA admin. The chain has to be added first."],
            ["Scorecard doesn't list older months", "Scorecard months start at the first sync. Stock snapshots can't be rebuilt for the past.", "Nothing to do. Older sales months are on the Sales page after the backfill."],
            ["\"Your session expired\"", "Signed in for more than 24 hours", "Sign in again and redo the last step."],
            ["\"Too many requests\"", "Too many sign-in attempts in a minute", "Wait 1 minute and try again."],
          ]}
        />
      </Step>
    </div>
  );
}
