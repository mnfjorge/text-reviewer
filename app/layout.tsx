import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Revisor de texto",
  description:
    "Compare versões de documentos e aprenda padrões de tradução e revisão com IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen`}
      >
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
            <a href="/" className="text-base font-semibold text-gray-900">
              Revisor de texto
            </a>
            <div className="flex items-center gap-5">
              <a
                href="/revise"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Revisar
              </a>
              <a
                href="/learnings"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Aprendizados
              </a>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
