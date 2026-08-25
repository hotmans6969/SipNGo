"use client";

import { usePathname } from "next/navigation";

/**
 * Fades page content in on navigation.
 *
 * Keying on the pathname remounts the subtree per route, which restarts the
 * animation. Only an entrance is animated — an exit would mean holding the old
 * page on screen after a tap, which makes the app feel slower, not smoother.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}
