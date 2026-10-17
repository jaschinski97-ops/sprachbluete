import TestRenderer, { act } from 'react-test-renderer';

import type { MicrophoneCaptureController } from '@/lib/speaking/microphone-capture';

const mockRequestPermission = jest.fn();
const mockSetAudioMode = jest.fn();
const mockStream = {
  start: jest.fn<Promise<void>, []>(),
  stop: jest.fn<void, []>(),
};
let mockOnBuffer:
  | ((buffer: {
      data: ArrayBuffer;
      sampleRate: number;
      channels: number;
      timestamp: number;
    }) => void)
  | undefined;

jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: () => mockRequestPermission(),
  setAudioModeAsync: (options: unknown) => mockSetAudioMode(options),
  useAudioStream: (options: { onBuffer?: typeof mockOnBuffer }) => {
    mockOnBuffer = options.onBuffer;
    return { stream: mockStream, isStreaming: false };
  },
}));

import { useMicrophoneCapture } from './use-microphone-capture';

let current: MicrophoneCaptureController | null = null;

function Harness({ maxDurationMs = 4_000, allowPlayback = false }: { maxDurationMs?: number; allowPlayback?: boolean }) {
  current = useMicrophoneCapture({ maxDurationMs, allowPlayback });
  return null;
}

function controller(): MicrophoneCaptureController {
  if (!current) throw new Error('Capture-Hook wurde noch nicht gerendert.');
  return current;
}

function int16Buffer(values: number[]): ArrayBuffer {
  const data = new ArrayBuffer(values.length * 2);
  const view = new DataView(data);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return data;
}

describe('nativer Mikrofon-Lebenszyklus', () => {
  beforeEach(() => {
    current = null;
    mockOnBuffer = undefined;
    mockRequestPermission.mockReset().mockResolvedValue({ granted: true });
    mockSetAudioMode.mockReset().mockResolvedValue(undefined);
    mockStream.start.mockReset().mockResolvedValue(undefined);
    mockStream.stop.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fragt die Berechtigung nicht beim Mounten, sondern erst beim Startknopf an', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockStream.start).not.toHaveBeenCalled();

    let started = false;
    await act(async () => {
      started = await controller().start();
    });
    expect(started).toBe(true);
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(mockStream.start).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).not.toHaveBeenCalled();
    expect(controller().isRecording).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
    expect(mockStream.stop).toHaveBeenCalled();
  });

  it('startet bei verweigerter Berechtigung keinen Audiostream', async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });

    let started = true;
    await act(async () => {
      started = await controller().start();
    });
    expect(started).toBe(false);
    expect(mockStream.start).not.toHaveBeenCalled();
    expect(controller().error?.code).toBe('permission-denied');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('aktiviert Wiedergabe erst nach dem Streamstart und beendet auch diese Aufnahme', async () => {
    const order: string[] = [];
    mockStream.start.mockImplementation(async () => { order.push('stream'); });
    mockSetAudioMode.mockImplementation(async () => { order.push('duplex'); });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Harness allowPlayback />); });
    expect(mockSetAudioMode).not.toHaveBeenCalled();
    await act(async () => { expect(await controller().start()).toBe(true); });
    expect(order).toEqual(['stream', 'duplex']);
    expect(mockSetAudioMode).toHaveBeenCalledWith({ allowsRecording: true, playsInSilentMode: true });
    await act(async () => { controller().cancel(); });
    expect(mockStream.stop).toHaveBeenCalled();
    expect(controller().isRecording).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('stellt nach dem Stopp die Wiedergabe-Sitzung wieder her (iOS bliebe sonst stumm)', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Harness />); });
    await act(async () => { expect(await controller().start()).toBe(true); });
    expect(mockSetAudioMode).not.toHaveBeenCalled();
    await act(async () => { await controller().stop(); });
    expect(mockStream.stop).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({ allowsRecording: false, playsInSilentMode: true });

    // Ohne erneuten Start fasst das Abbauen die Sitzung nicht noch einmal an.
    mockSetAudioMode.mockClear();
    await act(async () => { renderer.unmount(); });
    expect(mockSetAudioMode).not.toHaveBeenCalled();
  });

  it('verwirft einen gestarteten Stream, wenn die gemeinsame Audiositzung fehlschlaegt', async () => {
    mockSetAudioMode.mockRejectedValue(new Error('audio session failed'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Harness allowPlayback />); });
    await act(async () => { expect(await controller().start()).toBe(false); });
    expect(mockStream.stop).toHaveBeenCalled();
    expect(controller().error?.code).toBe('start-failed');
    expect(controller().isRecording).toBe(false);
    expect(controller().lastCapture).toBeNull();
    await act(async () => { renderer.unmount(); });
  });

  it('liefert lokales Mono-PCM und verwirft es bei clear wieder', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });
    await act(async () => {
      await controller().start();
    });

    await act(async () => {
      mockOnBuffer?.({
        data: int16Buffer([16_384, -16_384, 8_192, -8_192]),
        sampleRate: 8_000,
        channels: 1,
        timestamp: 0,
      });
    });

    await act(async () => {
      await controller().stop();
    });
    expect(controller().lastCapture?.sampleRate).toBe(8_000);
    expect(Array.from(controller().lastCapture?.samples ?? [])).toEqual([0.5, -0.5, 0.25, -0.25]);
    expect(controller().lastCapture?.reachedLimit).toBe(false);

    await act(async () => {
      controller().clear();
    });
    expect(controller().lastCapture).toBeNull();

    await act(async () => {
      renderer.unmount();
    });
  });

  it('stoppt automatisch an der festen Zeitgrenze', async () => {
    jest.useFakeTimers();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Harness maxDurationMs={1_000} />);
    });
    await act(async () => {
      await controller().start();
    });
    await act(async () => {
      mockOnBuffer?.({
        data: int16Buffer([8_192, 8_192, 8_192, 8_192]),
        sampleRate: 8_000,
        channels: 1,
        timestamp: 0,
      });
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(mockStream.stop).toHaveBeenCalled();
    expect(controller().lastCapture?.reachedLimit).toBe(true);
    expect(controller().isRecording).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});
