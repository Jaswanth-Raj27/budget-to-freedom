import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ShieldCheck, Layers, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/AppHeader";
import { TryItNow } from "@/components/TryItNow";
import { Reveal } from "@/components/Reveal";
import { pageMeta } from "@/lib/page-meta";
import editorialImage from "@/assets/editorial-finance.jpg";

export const Route = createFileRoute("/")({
  head: () => pageMeta("Credit card payoff planner", "Find your debt-free date. Compare Snowball and Avalanche, explore your payments, and save a private plan with Debt Free Buddy."),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto grid h-20 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-8">
        <Logo />
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:block">A little clarity. A lot of possibility.</span>
          <Button asChild variant="outline" size="sm"><Link to="/auth">Sign in <ArrowRight /></Link></Button>
        </div>
      </header>
      <main>
        <section className="home-hero relative mx-auto min-h-[430px] max-w-6xl overflow-hidden border-y border-border px-4 py-12 sm:min-h-[470px] sm:px-8 sm:py-14">
          <img src={editorialImage} width={1536} height={1024} alt="Tactile paper steps, brass coins, and a green sphere reaching the top" fetchPriority="high" />
          <div className="home-hero-copy relative">
            <p className="eyebrow flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Your next chapter starts here</p>
            <h1 className="mt-5 text-foreground">Debt Free Buddy<span className="mt-2 block italic text-primary">Less debt.<br />More life.</span></h1>
            <p className="mt-6 max-w-sm text-base text-foreground/80">A clear path from what you owe to what comes next. Find your payoff date, make a plan, and move forward on your terms.</p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>Get started — it’s free <ArrowRight /></Link></Button>
              <Button asChild variant="ghost" size="sm"><a href="#try">Try the numbers first <ArrowDown /></a></Button>
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <div className="grid gap-3 border-b py-5 text-xs text-muted-foreground sm:grid-cols-[1fr_auto]">
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> We never ask for your card number — just your balances and rates.</p>
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Private by design</span>
          </div>
          <Reveal><TryItNow /></Reveal>
          <Reveal className="py-14 sm:py-20">
            <div className="grid gap-8 border-t pt-8 sm:grid-cols-[1fr_2fr]">
              <div><p className="eyebrow">Small steps, real momentum</p><h2 className="editorial-title mt-3 text-3xl">A plan that’s<br />yours to shape.</h2></div>
              <div className="grid gap-8 sm:grid-cols-3">
                {[
                  { icon: Layers, title: "Start where you are", text: "Your cards, balances, and rates. No judgment attached." },
                  { icon: LineChart, title: "Find your rhythm", text: "Quick wins or less interest. Choose the strategy that fits you." },
                  { icon: ShieldCheck, title: "Keep moving forward", text: "Save a plan today. Come back and adjust it as life changes." },
                ].map(({ icon: Icon, title, text }, i) => <div key={title} className="min-w-0"><div className="flex items-center justify-between text-primary"><Icon className="h-5 w-5" /><span className="text-xs tabular-nums">0{i + 1}</span></div><h3 className="mt-5 text-sm font-bold">{title}</h3><p className="mt-2 text-sm text-muted-foreground">{text}</p></div>)}
              </div>
            </div>
          </Reveal>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t py-6 text-xs text-muted-foreground"><Logo /><span>A clearer picture of your financial future.</span></footer>
        </div>
      </main>
    </div>
  );
}
