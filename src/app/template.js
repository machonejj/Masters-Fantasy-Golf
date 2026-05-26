'use client';

import { usePathname } from 'next/navigation';
import { readSwipeDir } from '@/lib/pageTransition';

// A template re-mounts on every navigation (unlike a layout), which lets us run
// an enter animation on the incoming page. We only animate when a swipe set a
// direction for this path — so tab clicks (and desktop) stay instant.
export default function Template({ children }) {
  const pathname = usePathname();
  const dir = readSwipeDir(pathname);
  const cls = dir === 1 ? 'page-in-right' : dir === -1 ? 'page-in-left' : '';
  return <div className={cls}>{children}</div>;
}
