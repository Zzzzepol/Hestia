export const base = { rose: '#F3E8E2', plum: '#3F2B42', gold: '#D8942F', scrim: '#3F2B4288' } as const;
export const colors = {
  light: { background: base.rose, surface: '#FFF9F5', surfaceAlt: '#E8D8D1', text: base.plum, muted: '#634E64', border: '#A18C9E', nav: base.plum, navText: base.rose, accent: base.gold, selectedText: base.plum, danger: '#813C4D', success: '#315C4B', info: '#365466' },
  dark: { background: base.plum, surface: '#513B53', surfaceAlt: '#624D63', text: base.rose, muted: '#E5D4CE', border: '#B29DAE', nav: '#291D2C', navText: base.rose, accent: base.gold, selectedText: base.plum, danger: '#FFD0D6', success: '#C0E2CF', info: '#D0E5EF' },
} as const;
export type Scheme = keyof typeof colors;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const typeScale = { caption: 12, label: 14, body: 16, title: 22, display: 32 } as const;
export const statusMeta = {
  Available: { icon: 'checkmark-circle-outline', tone: 'success' }, Requested: { icon: 'time-outline', tone: 'info' }, Reserved: { icon: 'bookmark-outline', tone: 'info' }, Borrowed: { icon: 'arrow-forward-circle-outline', tone: 'info' }, 'Ready to return': { icon: 'return-down-back-outline', tone: 'success' }, Overdue: { icon: 'alarm-outline', tone: 'danger' }, 'Lost or damaged': { icon: 'warning-outline', tone: 'danger' }, 'Low stock': { icon: 'basket-outline', tone: 'danger' }, Returned: { icon: 'checkmark-done-outline', tone: 'success' }, Rejected: { icon: 'close-circle-outline', tone: 'danger' }, Cancelled: { icon: 'remove-circle-outline', tone: 'info' },
} as const;
