import './globals.css'

export const metadata = {
  title: 'EndpointGraph',
  description: 'API consumer dependency graph and breaking-change impact analyzer',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  )
}
