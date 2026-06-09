import "./globals.css";

export const metadata = {
  title: "Bolão FRAM · Copa 2026",
  description: "Bolão da Copa do Mundo 2026 do escritório.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="topo">
          <span className="marca">🏆 Bolão FRAM</span>
          <span className="sub">Copa do Mundo 2026</span>
        </div>
        {children}
      </body>
    </html>
  );
}
