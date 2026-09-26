import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useMotionTemplate } from "motion/react";
import { ShieldCheck, LineChart, Layers, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/AppHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Debt Free Buddy — Credit card payoff simulator" },
      { name: "description", content: "See exactly when you'll be debt-free. Compare Snowball vs Avalanche payoff plans for your credit cards." },
      { property: "og:title", content: "Debt Free Buddy — Credit card payoff simulator" },
      { property: "og:description", content: "Compare Snowball vs Avalanche and see your debt-free date. No card numbers, ever." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const spring = { stiffness: 150, damping: 18, mass: 0.4 };

function MagneticCTA({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      whileHover={reduce ? undefined : { scale: 1.04 }}
      transition={{ type: "spring", ...spring }}
      onMouseMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * 0.25);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.35);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className="inline-block rounded-md hover:glow-primary"
    >
      {children}
    </motion.div>
  );
}

function Landing() {
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const nx = useSpring(0, spring);
  const ny = useSpring(0, spring);
  const glow = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)`;
  const rotX = useTransform(ny, [-1, 1], [4, -4]);
  const rotY = useTransform(nx, [-1, 1], [-5, 5]);
  const shapeX = useTransform(nx, [-1, 1], [-18, 18]);
  const shapeY = useTransform(ny, [-1, 1], [-14, 14]);

  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 1000], [0, reduce ? 0 : -120]);

  function onMove(e: React.MouseEvent) {
    if (reduce || !heroRef.current) return;
    const r = heroRef.current.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
    nx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    ny.set(((e.clientY - r.top) / r.height) * 2 - 1);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <motion.div aria-hidden style={{ y: bgY }} className="landing-mesh pointer-events-none absolute inset-x-0 -top-20 h-[140%]" />
      <motion.div aria-hidden style={{ y: bgY }} className="landing-grid pointer-events-none absolute inset-x-0 -top-20 h-[140%]" />

      <header className="relative z-10 mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <section
          ref={heroRef}
          onMouseMove={onMove}
          onMouseLeave={() => { mx.set(-9999); my.set(-9999); nx.set(0); ny.set(0); }}
          className="relative -mx-4 rounded-3xl px-4 pb-8 pt-12 sm:-mx-6 sm:px-6 sm:pt-20"
          style={{ perspective: 1000 }}
        >
          {!reduce && <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl" style={{ background: glow }} />}

          {/* Floating shapes */}
          <motion.div aria-hidden style={reduce ? undefined : { x: shapeX, y: shapeY }} className="pointer-events-none absolute right-2 top-10 hidden sm:block">
            <div className="h-44 w-44 rounded-full border border-primary/25 bg-primary/5" />
            <div className="absolute -left-16 top-24 h-24 w-24 rounded-full border border-accent/15 bg-accent/5" />
            <div className="absolute left-24 top-36 h-10 w-10 rounded-full bg-primary/20 blur-sm" />
          </motion.div>

          <motion.div style={reduce ? undefined : { rotateX: rotX, rotateY: rotY }} className="relative">
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              className="text-sm font-medium uppercase tracking-widest text-primary">
              Credit card payoff simulator
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              Know the month you'll be <span className="text-primary">debt-free.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.12 }}
              className="mt-5 max-w-xl text-lg text-muted-foreground">
              Enter your card balances and rates, set a monthly budget, and see a clear payoff plan —
              plus how much interest you'll save compared to paying minimums.
            </motion.p>
          </motion.div>

          <div className="relative mt-8 flex flex-wrap items-center gap-4">
            <MagneticCTA>
              <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>Get started — it's free <ArrowRight className="h-4 w-4" /></Link></Button>
            </MagneticCTA>
          </div>
          <div className="relative mt-6 flex items-center gap-2 rounded-xl border bg-card/80 px-4 py-3 text-sm text-foreground shadow-card backdrop-blur sm:inline-flex">
            <ShieldCheck className="h-5 w-5 shrink-0 text-accent" />
            We never ask for your card number — just your balances and rates.
          </div>
        </section>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Layers, t: "Add your cards", d: "One at a time, from your saved cards, or import a CSV." },
            { icon: LineChart, t: "Pick a strategy", d: "Snowball for quick wins, Avalanche to save the most interest." },
            { icon: ShieldCheck, t: "Save your plan", d: "Your scenarios are private and waiting when you come back." },
          ].map(({ icon: Icon, t, d }, i) => (
            <motion.div
              key={t}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-2xl border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover motion-reduce:hover:translate-y-0"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15"><Icon className="h-5 w-5 text-accent" /></div>
              <h3 className="mt-4 font-semibold text-foreground">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
