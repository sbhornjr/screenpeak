import type { Metadata } from "next"

// page.tsx is a client component and can't export metadata itself.
export const metadata: Metadata = {
    title: "Reset Password",
    robots: { index: false },
}

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
    return children
}
