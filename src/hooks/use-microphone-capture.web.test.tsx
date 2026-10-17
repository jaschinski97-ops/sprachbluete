import TestRenderer, { act } from 'react-test-renderer';

import type { MicrophoneCaptureController } from '@/lib/speaking/microphone-capture';

import { useMicrophoneCapture } from './use-microphone-capture.web';

const mockGetUserMedia = jest.fn();
const mockTrackStop = jest.fn();
const mockContextClose = jest.fn<Promise<void>, []>();
let latestProcessor: FakeScriptProcessor | null = null;
let current: MicrophoneCaptureController | null = null;

class FakeNode {
  connect = jest.fn();
  disconnect = jest.fn();
}

class FakeScriptProcessor extends FakeNode {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null;
}

class FakeAudioContext {
  sampleRate = 16_000;
  destination = new FakeNode();
  audioWorklet = undefined;

  resume = jest.fn(async () => {});
  close = mockContextClose;
  createMediaStreamSource = jest.fn(() => new FakeNode());
  createGain = jest.fn(() => Object.assign(new FakeNode(), { gain: { value: 1 } }));
  createScriptProcessor = jest.fn(() => {
    latestProcessor = new FakeScriptProcessor();
    return latestProcessor;
  });
}

function Harness() {
  current = useMicrophoneCapture({ maxDurationMs: 4_000 });
  return null;
}

function controller(): MicrophoneCaptureController {
  if (!current) throw new Error('Web-Capture-Hook wurde noch nicht gerendert.');
  return current;
}

describe('Web-Mikrofon-Lebenszyklus', () => {
  let windowDescriptor: PropertyDescriptor | undefined;
  let navigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    current = null;
    latestProcessor = null;
    mockGetUserMedia.mockReset().mockResolvedValue({
      getTracks: () => [{ stop: mockTrackStop }],
    });
    mockTrackStop.mockReset();
    mockContextClose.mockReset().mockResolvedValue(undefined);

    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: FakeAudioContext },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: mockGetUserMedia } },
    });
  });

  afterEach(() => {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete (globalThis as { window?: unknown }).window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  });

  it('ruft getUserMedia erst nach dem ausdruecklichen Start auf und gibt alles frei', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });
    expect(mockGetUserMedia).not.toHaveBeenCalled();

    await act(async () => {
      await controller().start();
    });
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(controller().isRecording).toBe(true);

    await act(async () => {
      latestProcessor?.onaudioprocess?.({
        inputBuffer: {
          sampleRate: 16_000,
          getChannelData: () => new Float32Array([0.5, -0.5, 0.25, -0.25]),
        },
      } as unknown as AudioProcessingEvent);
      await controller().stop();
    });

    expect(Array.from(controller().lastCapture?.samples ?? [])).toEqual([0.5, -0.5, 0.25, -0.25]);
    expect(mockTrackStop).toHaveBeenCalled();
    expect(mockContextClose).toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it('meldet eine verweigerte Browserfreigabe und startet keine Aufnahme', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('verweigert', 'NotAllowedError'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });

    let started = true;
    await act(async () => {
      started = await controller().start();
    });
    expect(started).toBe(false);
    expect(controller().error?.code).toBe('permission-denied');
    expect(mockContextClose).toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});
