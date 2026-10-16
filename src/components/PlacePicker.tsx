'use client';

import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { AREAS, nearestArea } from '@/lib/geo';
import { useI18n } from '@/lib/i18n';
import type { Place } from '@/lib/location';
import { useMyPlace } from '@/lib/location';
import { MapView } from './Map';
import { Button, Field, Input, Select } from './ui';

/** Area + street address + a map pin the customer can tap to move. */
export function PlacePicker({ value, onChange }: { value: Place; onChange: (p: Place) => void }) {
  const { t } = useI18n();
  const { locate } = useMyPlace();
  const [locating, setLocating] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Select aria-label={t('area')} value={AREAS.some((a) => a.name === value.area) ? value.area : ''}
          onChange={(e) => {
            const a = AREAS.find((x) => x.name === e.target.value);
            if (a) onChange({ ...value, area: a.name, lat: a.lat, lng: a.lng });
          }}>
          {!AREAS.some((a) => a.name === value.area) && <option value="">{value.area}</option>}
          {AREAS.map((a) => <option key={a.name} value={a.name}>{a.name}, Jaipur</option>)}
        </Select>
        <Button type="button" variant="soft" loading={locating} icon={<LocateFixed className="size-4" />}
          aria-label={t('use_my_location')}
          onClick={async () => {
            setLocating(true);
            const p = await locate();
            setLocating(false);
            if (p) onChange({ ...value, ...p });
          }} />
      </div>
      <Field label={t('full_address')} htmlFor="address">
        <Input id="address" value={value.address ?? ''} placeholder="Plot 14, near…" onChange={(e) => onChange({ ...value, address: e.target.value })} />
      </Field>
      <MapView className="h-40" center={value} zoom={14} fit={false} recenter
        markers={[{ id: 'pin', lat: value.lat, lng: value.lng, kind: 'job' }]}
        onPick={(p) => onChange({ ...value, ...p, area: nearestArea(p).name })} />
      <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="size-3.5" /> Tap the map to move the pin</p>
    </div>
  );
}
