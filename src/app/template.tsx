/** Route-level page transition: every navigation enters with a soft fade-up. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
