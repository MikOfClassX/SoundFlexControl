import assert from "node:assert/strict";
import test from "node:test";
import { parseEventRecord, reduceEvent } from "../event-state.js";

test("event parser preserves quoted comma and escaped quote values", () => {
  assert.deepEqual(
    parseEventRecord('VIDEOINPUTEVENT VIDEOINPUTID=2, TYPE=NAME_CHANGED, VALUE="Camera, \\"A\\""'),
    {
      prefix: "VIDEOINPUTEVENT",
      fields: { VIDEOINPUTID: "2", TYPE: "NAME_CHANGED", VALUE: 'Camera, "A"' },
      raw: 'VIDEOINPUTEVENT VIDEOINPUTID=2, TYPE=NAME_CHANGED, VALUE="Camera, \\"A\\""',
    },
  );
  assert.equal(parseEventRecord("PING"), null);
  assert.equal(parseEventRecord("SERVEREVENT TYPE=4"), null);
});

test("event reducer applies unambiguous MixBoard and audio changes", () => {
  let snapshot = createSnapshot();
  snapshot = reduceEvent(snapshot, parseEventRecord("MIXBOARDEVENT TYPE=PROGRAM_CHANGED, CHANNEL=CH_2, VIDEOINPUTID=7")).snapshot;
  snapshot = reduceEvent(snapshot, parseEventRecord('AUDIOEVENT TYPE=CHANNEL_CHANGED, AUDIO_TRACK=PRV, VALUE="CH_2"')).snapshot;
  snapshot = reduceEvent(snapshot, parseEventRecord('AUDIOEVENT TYPE=VOLUME_CHANGED, AUDIO_TRACK=T1, VALUE="0.35"')).snapshot;
  snapshot = reduceEvent(snapshot, parseEventRecord('AUDIOEVENT TYPE=VOLUME_CHANGED, AUDIO_TRACK=PRV, VALUE="0.6"')).snapshot;

  assert.equal(snapshot.channels.CH_2.PROGRAM, 7);
  assert.equal(snapshot.soundFlex.CURRENT_CHANNEL, "CH_2");
  assert.equal(snapshot.soundFlex.TRACK_VOLUME.T1, 0.35);
  assert.equal(snapshot.soundFlex.PREVIEW_VOLUME, 0.6);
});

test("event reducer applies global input state and requests reconciliation for ambiguous channel state", () => {
  let snapshot = createSnapshot();
  let result = reduceEvent(snapshot, parseEventRecord('VIDEOINPUTEVENT VIDEOINPUTID=0, TYPE=AUDIO_TRACK_ENABLED, VALUE="5"'));
  snapshot = result.snapshot;
  assert.deepEqual(snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_TRACK_ENABLED, {
    T0: true,
    T1: false,
    T2: true,
    T3: false,
  });

  result = reduceEvent(snapshot, parseEventRecord('VIDEOINPUTEVENT VIDEOINPUTID=0, TYPE=AUDIO_ENABLED, VALUE="true"'));
  assert.equal(result.changed, false);
  assert.equal(result.reconcile, "soundFlex");
});

function createSnapshot() {
  const channels = {};
  for (const channel of ["CH_0", "CH_1", "CH_2", "CH_3"]) {
    channels[channel] = {
      ID: channel,
      NAME: channel,
      PREVIEW: 0,
      PROGRAM: 1,
      KEYER: [{ KEYERID: 0, VIDEOINPUTID: 0, STATUS: "STOP", LINK: false }],
      TRANSITION_STATUS: "TRANSITION_FINISHED",
    };
  }
  return {
    videoInputs: {
      VIDEOINPUT: [{ NAME: "Input 0", TALLY_STATUS: "AAAAA", VIDEOINPUTID: 0, TYPE: "NONE" }],
      MAX_SUPPORTED_INPUTS: 1,
    },
    soundFlex: {
      CURRENT_CHANNEL: "CH_0",
      PREVIEW_TRACK: "T0",
      PREVIEW_VOLUME: 1,
      SOLO_ENABLED: false,
      TRACK_VOLUME: { T0: 1, T1: 1, T2: 1, T3: 1 },
      VIDEOINPUT_AUDIOINFO: [{
        AUDIO_ENABLED: { CH_0: false, CH_1: false, CH_2: false, CH_3: false },
        MASTER_VOLUME_PER_CHANNEL: { CH_0: 1, CH_1: 1, CH_2: 1, CH_3: 1 },
        AUDIO_FOLLOW_VIDEO: { CH_0: false, CH_1: false, CH_2: false, CH_3: false },
        AUDIO_TRACK_ENABLED: { T0: false, T1: false, T2: false, T3: false },
        MASTER_VOLUME: 1,
        CHANNEL_VOLUME: [],
        SOLO: false,
        EQUALIZER_GAIN: { LOW: 0, MID: 0, HIGH: 0 },
      }],
    },
    channels,
    receivedAt: "2026-09-29T00:00:00.000Z",
  };
}
