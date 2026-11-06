// `sys sound …` in the renderer (docs/06-requirements/ui-sounds.md F7). Writes
// the same store as Settings → Sounds, so the panel shows what the CLI set.

import { isSoundMoment, isSoundPackId, SOUND_MOMENTS, SOUND_PACK_IDS, SOUND_PACKS } from './soundPacks';
import { useSoundSettings } from './soundSettings';
import { uiSounds } from './uiSounds';

function status(): string {
  const s = useSoundSettings.getState();
  return `sound: ${s.enabled ? 'on' : 'off'} · pack ${s.pack} (${SOUND_PACKS[s.pack].name}) · volume ${s.volume}`;
}

export function runSoundCommand(command: string, args: Record<string, unknown>): { ok: boolean; message: string } {
  const s = useSoundSettings.getState();
  switch (command) {
    case 'sound.status':
      return { ok: true, message: status() };
    case 'sound.list':
      return {
        ok: true,
        message: [
          'packs:',
          ...SOUND_PACK_IDS.map((id) => `  ${id}${id === s.pack ? ' *' : ''} — ${SOUND_PACKS[id].name}: ${SOUND_PACKS[id].feel}`),
          `moments: ${SOUND_MOMENTS.join(', ')}`,
        ].join('\n'),
      };
    case 'sound.on':
      s.setEnabled(true);
      return { ok: true, message: status() };
    case 'sound.off':
      s.setEnabled(false);
      return { ok: true, message: status() };
    case 'sound.pack': {
      const pack = args['pack'];
      if (!isSoundPackId(pack)) return { ok: false, message: `Unknown sound pack "${String(pack)}" (packs: ${SOUND_PACK_IDS.join(', ')})` };
      s.setPack(pack);
      return { ok: true, message: status() };
    }
    case 'sound.volume': {
      const v = Number(args['volume']);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: 'sound volume requires a number from 0 to 100' };
      s.setVolume(v);
      return { ok: true, message: status() };
    }
    case 'sound.play': {
      const moment = args['moment'];
      if (!isSoundMoment(moment)) return { ok: false, message: `Unknown moment "${String(moment)}" (moments: ${SOUND_MOMENTS.join(', ')})` };
      uiSounds.play(moment);
      return { ok: true, message: s.enabled && s.volume > 0 ? `Played ${moment} (${s.pack})` : `Sound is ${s.enabled ? 'at volume 0' : 'off'}; nothing played` };
    }
    default:
      return { ok: false, message: `Unknown sound command: ${command}` };
  }
}
