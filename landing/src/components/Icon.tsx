type IconName = 'arrow' | 'menu' | 'close' | 'pin' | 'box' | 'signal' | 'truck' | 'check' | 'phone'

const paths: Record<IconName, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  box: 'm3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5',
  signal: 'M5 18v2M10 13v7M15 8v12M20 3v17',
  truck: 'M1 4h13v13H1V4Zm13 5h4l4 5v3h-8V9ZM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  check: 'm5 12 4 4L19 6',
  phone: 'M5 3h4l2 5-3 2a16 16 0 0 0 6 6l2-3 5 2v4c0 2-2 3-4 2C9 19 5 15 3 7c-1-2 0-4 2-4Z',
}

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
