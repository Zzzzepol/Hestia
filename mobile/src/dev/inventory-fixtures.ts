type BaseItem = {
  id: string;
  name: string;
  category: string;
  location: string;
  photoUri?: string;
};

export type InventoryItem = BaseItem & (
  | { kind: 'consumable'; quantity: string; unit: string; lowStock: boolean }
  | { kind: 'returnable'; status: string; statusKey: 'available' | 'requested' | 'reserved' | 'borrowed' | 'ready' | 'damaged' | 'neutral' }
);

export const previewModes = ['demo', 'worst case', 'empty', 'one', '1,000 rows', 'loading', 'error', 'offline'] as const;
export type PreviewMode = (typeof previewModes)[number];

const demo: InventoryItem[] = [
  { id: 'detergent', name: 'Laundry detergent', category: 'Cleaning', location: 'Laundry shelf', kind: 'consumable', quantity: '1.5', unit: 'L', lowStock: true },
  { id: 'projector', name: 'Meeting room projector', category: 'Electronics', location: 'Cabinet B', kind: 'returnable', status: 'Borrowed by Mira', statusKey: 'borrowed' },
  { id: 'coffee', name: 'Coffee beans', category: 'Kitchen', location: 'Top pantry', kind: 'consumable', quantity: '12', unit: 'bags', lowStock: false },
];

const worst: InventoryItem[] = [
  { id: 'long-name', name: 'Community event setup kit with the very long labelled extension cable and projector adapters for the multipurpose meeting room', category: 'Shared equipment', location: 'Storage cabinet behind the reception desk', kind: 'returnable', status: 'Ready to return to Aleksandra Wiśniewska-Kowalczyk', statusKey: 'ready' },
  { id: 'no-photo', name: 'เครื่องชงกาแฟ ☕', category: 'Kitchen / ห้องครัว', location: 'ชั้นวางของใกล้หน้าต่าง', kind: 'returnable', status: 'Available', statusKey: 'available' },
  { id: 'huge-quantity', name: 'Printer paper 📄', category: 'Office', location: 'Room 12', kind: 'consumable', quantity: '999999999.999', unit: 'packs', lowStock: false },
  { id: 'zero-stock', name: '🧼', category: 'Cleaning', location: 'Supply room', kind: 'consumable', quantity: '0', unit: 'bottles', lowStock: true },
  { id: 'long-unbroken', name: 'ProjectorAdapterModelAXJ4200UltraCompactMultipurposeUnitWithExtendedSerialLabel', category: 'Electronics', location: 'Cabinet A', kind: 'returnable', status: 'Reserved', statusKey: 'reserved' },
];

const thousand: InventoryItem[] = Array.from({ length: 1000 }, (_, index) => ({
  ...demo[index % demo.length],
  id: 'bulk-' + index,
  name: demo[index % demo.length].name + ' ' + (index + 1),
}));

export const inventoryFixtures: Record<PreviewMode, InventoryItem[]> = {
  demo,
  'worst case': worst,
  empty: [],
  one: [demo[0]],
  '1,000 rows': thousand,
  loading: [],
  error: [],
  offline: demo,
};
