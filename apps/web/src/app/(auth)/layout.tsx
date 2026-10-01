// One centered column for the signed-out pages. The route group does not
// change their URLs.
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 font-sans">
      <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
    </main>
  );
}
