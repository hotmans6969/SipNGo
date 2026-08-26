"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A repeating chime for the counter, sounding while orders are waiting to be
 * accepted and stopping the moment staff start preparing one.
 *
 * It repeats rather than playing once because a single beep is missed on a
 * busy counter, and the order then sits unmade with nothing to show for it.
 *
 * Browsers refuse to start audio before the page has been interacted with, so
 * the context can come up suspended. That failure is silent, which for an
 * alarm is the worst possible outcome — a counter believing it will be told
 * about orders while nothing plays. `blocked` reports that state so the page
 * can offer a button to unmute, and any interaction with the page also tries
 * to resume it.
 */
export function useOrderAlarm(active: boolean, intervalMs: number = 4000) {
  const contextRef = useRef<AudioContext | null>(null);
  const [blocked, setBlocked] = useState(false);

  const context = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!contextRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      contextRef.current = new Ctor();
    }
    return contextRef.current;
  }, []);

  /** Two rising notes — distinct from a phone notification, hard to ignore. */
  const chime = useCallback(() => {
    const ctx = context();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
      if (ctx.state === "suspended") {
        setBlocked(true);
        return;
      }
    }
    setBlocked(false);

    const play = (startAt: number, frequency: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, startAt);
      // A short attack and exponential release reads as a "ding" rather than
      // a beep, and avoids the click of a hard gain change.
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.5, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.5);
    };

    play(ctx.currentTime, 880);
    play(ctx.currentTime + 0.22, 1175);
  }, [context]);

  /** Called from a real user gesture, which is what browsers require. */
  const enableSound = useCallback(async () => {
    const ctx = context();
    if (!ctx) return;
    try {
      await ctx.resume();
      setBlocked(ctx.state === "suspended");
      if (ctx.state === "running") chime();
    } catch {
      setBlocked(true);
    }
  }, [context, chime]);

  useEffect(() => {
    if (!active) return;

    // chime() can set `blocked`, which the linter reads as a synchronous
    // setState in an effect. It is the intended behaviour: the first attempt
    // to play is what reveals whether the browser is allowing audio at all.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chime();
    const timer = setInterval(chime, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, chime]);

  // Any interaction with the page is a chance to unblock audio, so a staff
  // member who taps anything gets sound without having to find a button.
  useEffect(() => {
    if (!blocked) return;
    const resume = () => {
      void context()?.resume().then(() => setBlocked(false)).catch(() => {});
    };
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
    return () => {
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
    };
  }, [blocked, context]);

  // Release the audio device when the board is closed.
  useEffect(() => {
    return () => {
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    };
  }, []);

  return { blocked, enableSound };
}
