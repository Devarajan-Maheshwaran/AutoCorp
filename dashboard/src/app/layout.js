import './globals.css';

export const metadata = {
  title: 'AutoCorp Glassbox Dashboard',
  description: 'Real-time transparent view of autonomous AI agent business operations',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
