# Directory Structure
```
genlayer-project-boilerplate/
  config/
    __init__.py
    genlayer_config.py
  contracts/
    __init__.py
    football_bets.py
  frontend/
    app/
      globals.css
      layout.tsx
      page.tsx
      providers.tsx
    components/
      ui/
        alert.tsx
        badge.tsx
        button.tsx
        dialog.tsx
        input.tsx
        label.tsx
      AccountPanel.tsx
      AddressDisplay.tsx
      BetsTable.tsx
      CreateBetModal.tsx
      Leaderboard.tsx
      Logo.tsx
      Navbar.tsx
    .env.example
    package.json
    README.md
    tailwind.config.ts
  __init__.py
  CLAUDE.md
  LICENSE
  package.json
  README.md
  requirements.txt
hackaclaw-app/
  src/
    app/
      api/
        v1/
          admin/
            hackathons/
              [id]/
                finalize/
                  route.ts
                judge/
                  route.ts
          agents/
            leaderboard/
              route.ts
            me/
              route.ts
            register/
              route.ts
          balance/
            test-credit/
              route.ts
            transactions/
              route.ts
            route.ts
          cron/
            judge/
              route.ts
          hackathons/
            [id]/
              activity/
                route.ts
              building/
                route.ts
              check-deadline/
                route.ts
              contract/
                route.ts
              join/
                route.ts
              judge/
                submit/
                  route.ts
                route.ts
              leaderboard/
                route.ts
              teams/
                [teamId]/
                  join/
                    route.ts
                  prompt/
                    route.ts
                  submit/
                    route.ts
                route.ts
              route.ts
            route.ts
          marketplace/
            offers/
              [offerId]/
                route.ts
              route.ts
            route.ts
          models/
            route.ts
          proposals/
            route.ts
          seed-test/
            route.ts
          submissions/
            [subId]/
              preview/
                route.ts
          route.ts
      enterprise/
        enterprise-wallet-provider.tsx
        layout.tsx
      client-layout.tsx
      favicon.ico
      json-ld.tsx
      layout.tsx
      nav-and-footer.tsx
      opengraph-image.tsx
      providers.tsx
      robots.ts
      sitemap.ts
    hooks/
      useDeployEscrow.ts
    middleware.ts
  .env.example
  AGENTS.md
  CLAUDE.md
  lint.json
  next-env.d.ts
  package.json
  README.md
  vercel.json
hackaclaw-contracts/
  script/
    Deploy.s.sol
  src/
    HackathonEscrow.sol
    HackathonFactory.sol
  .env.example
  .gitmodules
  foundry.lock
  README.md
.gitmodules
.repomixignore
agent-compete.js
AGENTS.md
AUDIT_FEATURES.md
populate-test.sh
README.md
test-bot.js
test-bots.sh
```

# Files

## File: genlayer-project-boilerplate/config/genlayer_config.py
````python
import os

from dotenv import load_dotenv

load_dotenv()


def get_config() -> dict:
    config = {
        "rpc_protocol": os.environ["RPCPROTOCOL"],
        "rpc_host": os.environ["RPCHOST"],
        "rpc_port": os.environ["RPCPORT"],
    }
    return config
````

## File: genlayer-project-boilerplate/contracts/football_bets.py
````python
# { "Depends": "py-genlayer:test" }

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Bet:
    id: str
    has_resolved: bool
    game_date: str
    resolution_url: str
    team1: str
    team2: str
    predicted_winner: str
    real_winner: str
    real_score: str


class FootballBets(gl.Contract):
    bets: TreeMap[Address, TreeMap[str, Bet]]
    points: TreeMap[Address, u256]

    def __init__(self):
        pass

    def _check_match(self, resolution_url: str, team1: str, team2: str) -> dict:
        def get_match_result() -> str:
            web_data = gl.nondet.web.render(resolution_url, mode="text")

            task = f"""
Extract the match result for:
Team 1: {team1}
Team 2: {team2}

Web content:
{web_data}

Respond in JSON:
{{
    "score": str, // e.g., "1:2" or "-" if unresolved
    "winner": int // 0 for draw, -1 if unresolved
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
        """
            result = gl.nondet.exec_prompt(task, response_format="json")
            return json.dumps(result, sort_keys=True)

        result_json = json.loads(gl.eq_principle.strict_eq(get_match_result))
        return result_json

    @gl.public.write
    def create_bet(
        self, game_date: str, team1: str, team2: str, predicted_winner: str
    ) -> None:
        match_resolution_url = (
            "https://www.bbc.com/sport/football/scores-fixtures/" + game_date
        )
        # commented to allow to test matches in the past.
        # match_status = await self._check_match(match_resolution_url, team1, team2)

        # if int(match_status["winner"]) > -1:
        #    raise Exception("Game already finished")

        sender_address = gl.message.sender_address

        bet_id = f"{game_date}_{team1}_{team2}".lower()
        if sender_address in self.bets and bet_id in self.bets[sender_address]:
            raise Exception("Bet already created")

        bet = Bet(
            id=bet_id,
            has_resolved=False,
            game_date=game_date,
            resolution_url=match_resolution_url,
            team1=team1,
            team2=team2,
            predicted_winner=predicted_winner,
            real_winner="",
            real_score="",
        )
        self.bets.get_or_insert_default(sender_address)[bet_id] = bet

    @gl.public.write
    def resolve_bet(self, bet_id: str) -> None:
        if self.bets[gl.message.sender_address][bet_id].has_resolved:
            raise Exception("Bet already resolved")

        bet = self.bets[gl.message.sender_address][bet_id]
        bet_status = self._check_match(bet.resolution_url, bet.team1, bet.team2)

        if int(bet_status["winner"]) < 0:
            raise Exception("Game not finished")

        bet.has_resolved = True
        bet.real_winner = str(bet_status["winner"])
        bet.real_score = bet_status["score"]

        if bet.real_winner == bet.predicted_winner:
            if gl.message.sender_address not in self.points:
                self.points[gl.message.sender_address] = 0
            self.points[gl.message.sender_address] += 1

    @gl.public.view
    def get_bets(self) -> dict:
        return {k.as_hex: v for k, v in self.bets.items()}

    @gl.public.view
    def get_points(self) -> dict:
        return {k.as_hex: v for k, v in self.points.items()}

    @gl.public.view
    def get_player_points(self, player_address: str) -> int:
        return self.points.get(Address(player_address), 0)
````

## File: genlayer-project-boilerplate/frontend/app/globals.css
````css
@import "tailwindcss";

/* GenLayer Brand Guidelines 2025 - Typography via next/font */
/* --font-body: Inter (Switzer alternative) */
/* --font-display: Space Grotesk (Lineca alternative) */

@custom-variant dark (&:is(.dark *));

/* GenLayer Brand Colors 2025 */
:root {
  /* Base colors - keep black background for dark theme */
  --background: oklch(0 0 0);
  --foreground: oklch(0.98 0 0);

  /* Cards with navy tint per brand guidelines */
  --card: oklch(0.25 0.08 265);
  --card-foreground: oklch(0.98 0 0);
  --popover: oklch(0.25 0.08 265);
  --popover-foreground: oklch(0.98 0 0);

  /* Primary: Purple-Pink Gradient (#9B6AF6 → #E37DF7) */
  --primary: oklch(0.65 0.22 300);
  --primary-foreground: oklch(0.98 0 0);

  /* Secondary: Navy Blue (#282B5D) */
  --secondary: oklch(0.25 0.08 265);
  --secondary-foreground: oklch(0.98 0 0);

  /* Muted states */
  --muted: oklch(0.18 0.04 265);
  --muted-foreground: oklch(0.55 0 0);

  /* Accent: Purple (brand primary) */
  --accent: oklch(0.65 0.22 300);
  --accent-foreground: oklch(0.98 0 0);

  /* Brand Blue: #110FFF */
  --blue: oklch(0.55 0.37 265);
  --blue-foreground: oklch(0.98 0 0);

  /* Brand Pink (gradient end): #E37DF7 */
  --pink: oklch(0.78 0.18 330);

  /* Destructive remains red */
  --destructive: oklch(0.65 0.25 25);
  --destructive-foreground: oklch(0.98 0 0);

  /* Borders and inputs with navy tint */
  --border: oklch(0.25 0.08 265);
  --input: oklch(0.20 0.06 265);
  --ring: oklch(0.65 0.22 300);

  /* Chart colors using brand palette */
  --chart-1: oklch(0.65 0.22 300); /* Purple */
  --chart-2: oklch(0.78 0.18 330); /* Pink */
  --chart-3: oklch(0.55 0.37 265); /* Blue */
  --chart-4: oklch(0.25 0.08 265); /* Navy */
  --chart-5: oklch(0.60 0.20 315); /* Purple-Pink mid */

  --radius: 0.5rem;

  /* Sidebar colors */
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.65 0.22 300);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

/* Dark theme (same as root for this project - already dark) */
.dark {
  --background: oklch(0 0 0);
  --foreground: oklch(0.98 0 0);
  --card: oklch(0.25 0.08 265);
  --card-foreground: oklch(0.98 0 0);
  --popover: oklch(0.25 0.08 265);
  --popover-foreground: oklch(0.98 0 0);
  --primary: oklch(0.65 0.22 300);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.25 0.08 265);
  --secondary-foreground: oklch(0.98 0 0);
  --muted: oklch(0.18 0.04 265);
  --muted-foreground: oklch(0.55 0 0);
  --accent: oklch(0.65 0.22 300);
  --accent-foreground: oklch(0.98 0 0);
  --destructive: oklch(0.65 0.25 25);
  --destructive-foreground: oklch(0.98 0 0);
  --border: oklch(0.25 0.08 265);
  --input: oklch(0.20 0.06 265);
  --ring: oklch(0.65 0.22 300);
  --chart-1: oklch(0.65 0.22 300);
  --chart-2: oklch(0.78 0.18 330);
  --chart-3: oklch(0.55 0.37 265);
  --chart-4: oklch(0.25 0.08 265);
  --chart-5: oklch(0.60 0.20 315);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.65 0.22 300);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.25 0.08 265);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.25 0.08 265);
  --sidebar-ring: oklch(0.65 0.22 300);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply text-foreground;
    /* Use Inter (via --font-body from layout.tsx) */
    font-family: var(--font-body), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }

  h1, h2, h3, h4, h5, h6 {
    /* Use Space Grotesk for headings (via --font-display from layout.tsx) */
    font-family: var(--font-display), var(--font-body), sans-serif;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
}

/* GenLayer Brand Utilities 2025 - Clean, Modern Design */
@layer utilities {
  /* Animations */
  .animate-fade-in {
    animation: fadeIn 0.5s ease-out forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slide-up {
    animation: slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Brand Gradient Utilities */
  .gradient-purple-pink {
    background: linear-gradient(135deg, oklch(0.65 0.22 300) 0%, oklch(0.78 0.18 330) 100%);
  }

  .gradient-purple-blue {
    background: linear-gradient(135deg, oklch(0.65 0.22 300) 0%, oklch(0.55 0.37 265) 100%);
  }

  /* Clean Card Styles (replacing glass-morphism) */
  .brand-card {
    background: oklch(0.25 0.08 265 / 0.6);
    border: 1px solid oklch(0.30 0.10 265 / 0.4);
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .brand-card-hover:hover {
    border-color: oklch(0.65 0.22 300 / 0.6);
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1),
                0 0 0 1px oklch(0.65 0.22 300 / 0.2);
    transform: translateY(-2px);
  }

  /* Clean Navbar */
  .brand-navbar {
    background: oklch(0 0 0 / 0.8);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid oklch(0.25 0.08 265 / 0.4);
  }

  /* Brand Button Styles - Primary (Purple Gradient) */
  .btn-primary {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    background: linear-gradient(135deg, oklch(0.65 0.22 300) 0%, oklch(0.78 0.18 330) 100%);
    color: oklch(0.98 0 0);
    font-weight: 500;
    border: none;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px 0 oklch(0.65 0.22 300 / 0.2);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px 0 oklch(0.65 0.22 300 / 0.3);
    filter: brightness(1.1);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  /* Brand Button - Secondary (Navy) */
  .btn-secondary {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    background: oklch(0.25 0.08 265);
    color: oklch(0.98 0 0);
    font-weight: 500;
    border: 1px solid oklch(0.30 0.10 265);
    transition: all 0.2s ease;
  }

  .btn-secondary:hover:not(:disabled) {
    background: oklch(0.28 0.10 265);
    border-color: oklch(0.65 0.22 300 / 0.5);
    transform: translateY(-1px);
  }

  /* Brand Button - Blue */
  .btn-blue {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    background: oklch(0.55 0.37 265);
    color: oklch(0.98 0 0);
    font-weight: 500;
    border: none;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px 0 oklch(0.55 0.37 265 / 0.2);
  }

  .btn-blue:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px 0 oklch(0.55 0.37 265 / 0.3);
    filter: brightness(1.1);
  }

  /* Betting Panel Button States (Simplified) */
  .bet-button-unselected {
    background: oklch(0.25 0.08 265 / 0.5);
    border: 1px solid oklch(0.30 0.10 265 / 0.4);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .bet-button-unselected-a:hover {
    background: oklch(0.28 0.12 300 / 0.6);
    border-color: oklch(0.65 0.22 300 / 0.6);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px 0 oklch(0.65 0.22 300 / 0.2);
  }

  .bet-button-unselected-b:hover {
    background: oklch(0.28 0.15 265 / 0.6);
    border-color: oklch(0.55 0.37 265 / 0.6);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px 0 oklch(0.55 0.37 265 / 0.2);
  }

  .bet-button-selected-a {
    background: oklch(0.25 0.08 265 / 0.6);
    color: oklch(0.98 0 0);
    border: 1px solid oklch(0.65 0.22 300);
    box-shadow: 0 0 0 2px oklch(0.65 0.22 300 / 0.2), 0 4px 12px 0 oklch(0.65 0.22 300 / 0.3);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .bet-button-selected-b {
    background: oklch(0.25 0.08 265 / 0.6);
    color: oklch(0.98 0 0);
    border: 1px solid oklch(0.55 0.37 265);
    box-shadow: 0 0 0 2px oklch(0.55 0.37 265 / 0.2), 0 4px 12px 0 oklch(0.55 0.37 265 / 0.3);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

/* GenLayer Brand Background - Clean with Subtle Purple Gradient */
@keyframes brandGradientShift {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

html {
  min-height: 100vh !important;
  height: 100%;
  scroll-behavior: smooth;
  background-color: #000000 !important;
  background-image:
    radial-gradient(ellipse 80% 60% at 50% -20%, oklch(0.65 0.22 300 / 0.08) 0%, transparent 60%),
    radial-gradient(ellipse 70% 50% at 80% 80%, oklch(0.55 0.37 265 / 0.05) 0%, transparent 50%),
    linear-gradient(180deg, #000000 0%, #0a0a0f 50%, #000000 100%);
  background-attachment: fixed !important;
  background-size: 200% 200% !important;
  background-repeat: no-repeat !important;
  animation: brandGradientShift 20s ease infinite;
  overscroll-behavior: none;
}

body {
  margin: 0;
  padding: 0;
  min-height: 100vh !important;
  overscroll-behavior: none;
}

/* Smooth visual integration for content areas */
main {
  position: relative;
}

/* Subtle top fade to blend with navbar */
main::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2rem;
  background: linear-gradient(to bottom,
    oklch(0.1 0.01 0 / 0.6) 0%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 0;
}

/* Ensure content is above the fade effect */
main > * {
  position: relative;
  z-index: 1;
}

/* Reown AppKit Modal Customization */
/* Hide "UX by Reown" branding */
w3m-legal-footer,
[data-testid="w3m-legal-footer"],
wcm-legal-footer {
  display: none !important;
}

/* Match project border radius consistently - 8px for cleaner look */
w3m-modal,
wcm-modal,
w3m-router,
wcm-router,
w3m-modal-content,
wcm-modal-content {
  --w3m-border-radius-master: 8px !important;
}

/* Enhance modal glass-morphism to match app theme */
w3m-modal,
wcm-modal {
  --w3m-background: oklch(0.24 0.01 0 / 0.95) !important;
  --w3m-color-overlay: oklch(0 0 0 / 0.8) !important;
}

/* Override all border radius in AppKit components */
w3m-modal *,
wcm-modal *,
w3m-button,
wcm-button,
w3m-wallet-button,
wcm-wallet-button,
w3m-card,
wcm-card,
w3m-input,
wcm-input {
  border-radius: 8px !important;
}

/* Smaller radius for internal elements */
w3m-wallet-image,
wcm-wallet-image,
w3m-network-image,
wcm-network-image {
  border-radius: 6px !important;
}

/* Hide network compatibility warning */
w3m-info-footer,
wcm-info-footer,
[data-testid="w3m-info-footer"],
[data-testid="wcm-info-footer"] {
  display: none !important;
}

/* Hide Send/Swap/Onramp features in wallet modal */
/* Target legacy component names */
w3m-button[data-variant="send"],
wcm-button[data-variant="send"],
w3m-send-button,
wcm-send-button,
[data-testid="w3m-send-button"],
[data-testid="wcm-send-button"],
w3m-swap-button,
wcm-swap-button,
w3m-onramp-button,
wcm-onramp-button,
w3m-wallet-features,
wcm-wallet-features,
w3m-account-token-send-button,
wcm-account-token-send-button,
w3m-wallet-send-button,
wcm-wallet-send-button,
/* Target new web components (wui-*) */
wui-list-item[data-variant="send"],
wui-list-item[data-type="send"],
wui-list-button[data-variant="send"],
wui-action-list-item[data-variant="send"],
wui-list-item:has(wui-icon[name="send"]),
wui-list-item:has(wui-icon[name="swap"]),
wui-list-item:has(wui-icon[name="onramp"]),
/* Position-based hiding - assuming Send is 2nd item after Fund wallet */
w3m-account-view wui-list-item:nth-child(2),
wcm-account-view wui-list-item:nth-child(2),
wui-account-view wui-list-item:nth-child(2),
/* Alternative selectors for various modal states */
[data-view="Account"] wui-list-item:nth-child(2),
[data-view="account"] wui-list-item:nth-child(2),
/* Broad fallback - hide any list item with send/swap/onramp icons */
wui-list-item[icon="send"],
wui-list-item[icon="swap"],
wui-list-item[icon="onramp"],
wui-list-item[data-icon="send"],
wui-list-item[data-icon="swap"],
wui-list-item[data-icon="onramp"] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
````

## File: genlayer-project-boilerplate/frontend/app/layout.tsx
````typescript
import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Font for body text and UI (Switzer alternative per brand guidelines)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Font for titles (Lineca alternative per brand guidelines)
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GenLayer Football Market",
  description: "AI-powered football match predictions on GenLayer blockchain. Create bets, make predictions, and compete for points.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#9B6AF6", // GenLayer brand purple
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
````

## File: genlayer-project-boilerplate/frontend/app/page.tsx
````typescript
"use client";

import { Navbar } from "@/components/Navbar";
import { BetsTable } from "@/components/BetsTable";
import { Leaderboard } from "@/components/Leaderboard";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <Navbar />

      {/* Main Content - Padding to account for fixed navbar */}
      <main className="flex-grow pt-20 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
              Football Prediction Betting
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              AI-powered football match predictions on GenLayer blockchain.
              <br />
              Create bets, make predictions, and compete for points.
            </p>
          </div>

          {/* Main Grid Layout - 2/1 columns on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Left Column - Bets Table (67% on desktop) */}
            <div className="lg:col-span-8 animate-slide-up">
              <BetsTable />
            </div>

            {/* Right Column - Leaderboard (33% on desktop) */}
            <div className="lg:col-span-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <Leaderboard />
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-8 glass-card p-6 md:p-8 animate-fade-in" style={{ animationDelay: "200ms" }}>
            <h2 className="text-2xl font-bold mb-4">How it Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">1. Create a Bet</div>
                <p className="text-sm text-muted-foreground">
                  Connect your wallet and create a football match prediction. Choose the teams, date, and your predicted winner.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">2. Wait for Resolution</div>
                <p className="text-sm text-muted-foreground">
                  After the match, the bet creator resolves the bet. GenLayer's AI verifies the actual match result.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">3. Earn Points</div>
                <p className="text-sm text-muted-foreground">
                  Correct predictions earn you points. Climb the leaderboard and prove your football knowledge!
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-2">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <a
                href="https://genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                Powered by GenLayer
              </a>
              <a
                href="https://studio.genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                Studio
              </a>
              <a
                href="https://docs.genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                Docs
              </a>
              <a
                href="https://github.com/genlayerlabs/genlayer-project-boilerplate"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                GitHub
              </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
````

## File: genlayer-project-boilerplate/frontend/app/providers.tsx
````typescript
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { WalletProvider } from "@/lib/genlayer/WalletProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  // Use useState to ensure QueryClient is only created once per component lifecycle
  // This prevents the client from being recreated on every render
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        {children}
      </WalletProvider>
      <Toaster
        position="top-right"
        theme="dark"
        richColors
        closeButton
        offset="80px"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
            boxShadow: '0 8px 32px hsl(var(--background) / 0.8)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
````

## File: genlayer-project-boilerplate/frontend/components/ui/alert.tsx
````typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
````

## File: genlayer-project-boilerplate/frontend/components/ui/badge.tsx
````typescript
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
````

## File: genlayer-project-boilerplate/frontend/components/ui/button.tsx
````typescript
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        gradient: 'gradient-purple-pink text-white hover:opacity-90 shadow-md hover:shadow-lg',
        blue: 'bg-[var(--blue)] text-white hover:bg-[var(--blue)]/90 shadow-md',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
````

## File: genlayer-project-boilerplate/frontend/components/ui/dialog.tsx
````typescript
"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-fade-in",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] glass-card rounded-2xl p-6 shadow-lg duration-200 data-[state=open]:animate-slide-up sm:rounded-2xl",
        "border border-border/20",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold uppercase tracking-wider leading-none",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
````

## File: genlayer-project-boilerplate/frontend/components/ui/input.tsx
````typescript
import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
````

## File: genlayer-project-boilerplate/frontend/components/ui/label.tsx
````typescript
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
````

## File: genlayer-project-boilerplate/frontend/components/AccountPanel.tsx
````typescript
"use client";

import { useState } from "react";
import { User, LogOut, AlertCircle, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet";
import { usePlayerPoints } from "@/lib/hooks/useFootballBets";
import { success, error, userRejected } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";

export function AccountPanel() {
  const {
    address,
    isConnected,
    isMetaMaskInstalled,
    isOnCorrectNetwork,
    isLoading,
    connectWallet,
    disconnectWallet,
    switchWalletAccount,
  } = useWallet();

  const { data: points = 0 } = usePlayerPoints(address);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleConnect = async () => {
    if (!isMetaMaskInstalled) {
      return;
    }

    try {
      setIsConnecting(true);
      setConnectionError("");
      await connectWallet();
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Failed to connect wallet:", err);
      setConnectionError(err.message || "Failed to connect to MetaMask");

      if (err.message?.includes("rejected")) {
        userRejected("Connection cancelled");
      } else {
        error("Failed to connect wallet", {
          description: err.message || "Check your MetaMask and try again."
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setIsModalOpen(false);
  };

  const handleSwitchAccount = async () => {
    try {
      setIsSwitching(true);
      setConnectionError("");
      await switchWalletAccount();
      // Keep modal open to show new account info
    } catch (err: any) {
      console.error("Failed to switch account:", err);

      // Don't show error if user cancelled
      if (!err.message?.includes("rejected")) {
        setConnectionError(err.message || "Failed to switch account");
        error("Failed to switch account", {
          description: err.message || "Please try again."
        });
      } else {
        userRejected("Account switch cancelled");
      }
    } finally {
      setIsSwitching(false);
    }
  };

  // Not connected state
  if (!isConnected) {
    return (
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogTrigger asChild>
          <Button variant="gradient" disabled={isLoading}>
            <User className="w-4 h-4 mr-2" />
            Connect Wallet
          </Button>
        </DialogTrigger>
        <DialogContent className="brand-card border-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Connect to GenLayer
            </DialogTitle>
            <DialogDescription>
              Connect your MetaMask wallet to start betting
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {!isMetaMaskInstalled ? (
              <>
                <Alert variant="default" className="bg-accent/10 border-accent/20">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>MetaMask Not Detected</AlertTitle>
                  <AlertDescription>
                    Please install MetaMask to continue. MetaMask is a crypto
                    wallet that allows you to interact with blockchain applications.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={() => window.open(METAMASK_INSTALL_URL, "_blank")}
                  variant="gradient"
                  className="w-full h-14 text-lg"
                >
                  <ExternalLink className="w-5 h-5 mr-2" />
                  Install MetaMask
                </Button>

                <div className="p-4 rounded-lg bg-muted/10 border border-muted/20">
                  <p className="text-xs text-muted-foreground">
                    After installing MetaMask, refresh this page and click
                    &quot;Connect Wallet&quot; again.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Button
                  onClick={handleConnect}
                  variant="gradient"
                  className="w-full h-14 text-lg"
                  disabled={isConnecting}
                >
                  <User className="w-5 h-5 mr-2" />
                  {isConnecting ? "Connecting..." : "Connect MetaMask"}
                </Button>

                {connectionError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Connection Error</AlertTitle>
                    <AlertDescription>{connectionError}</AlertDescription>
                  </Alert>
                )}

                <div className="p-4 rounded-lg bg-muted/10 border border-muted/20">
                  <p className="text-xs text-muted-foreground">
                    This will open MetaMask and prompt you to:
                  </p>
                  <ol className="text-xs text-muted-foreground list-decimal list-inside mt-2 space-y-1">
                    <li>Connect your wallet to this application</li>
                    <li>Add the GenLayer network to MetaMask</li>
                    <li>Switch to the GenLayer network</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Connected state
  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <div className="flex items-center gap-4">
        <div className="brand-card px-4 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-accent" />
            <AddressDisplay address={address} maxLength={12} />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-accent">{points}</span>
            <span className="text-xs text-muted-foreground">pts</span>
          </div>
        </div>

        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <User className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="brand-card border-2">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Wallet Details
          </DialogTitle>
          <DialogDescription>
            Your connected MetaMask wallet information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="brand-card p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Your Address</p>
            <code className="text-sm font-mono break-all">{address}</code>
          </div>

          <div className="brand-card p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Your Points</p>
            <p className="text-2xl font-bold text-accent">{points}</p>
          </div>

          <div className="brand-card p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Network Status</p>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnCorrectNetwork
                    ? "bg-green-500"
                    : "bg-yellow-500 animate-pulse"
                }`}
              />
              <span className="text-sm">
                {isOnCorrectNetwork
                  ? "Connected to GenLayer"
                  : "Wrong Network"}
              </span>
            </div>
          </div>

          {!isOnCorrectNetwork && (
            <Alert variant="default" className="bg-yellow-500/10 border-yellow-500/20">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertTitle>Network Warning</AlertTitle>
              <AlertDescription>
                You&apos;re not on the GenLayer network. Please switch networks in
                MetaMask or try reconnecting.
              </AlertDescription>
            </Alert>
          )}

          {connectionError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{connectionError}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 pt-4 border-t border-white/10 space-y-3">
            <Button
              onClick={handleSwitchAccount}
              variant="outline"
              className="w-full"
              disabled={isSwitching || isLoading}
            >
              <User className="w-4 h-4 mr-2" />
              {isSwitching ? "Switching..." : "Switch Account"}
            </Button>

            <Button
              onClick={handleDisconnect}
              className="w-full text-destructive hover:text-destructive"
              variant="outline"
              disabled={isSwitching || isLoading}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Disconnect Wallet
            </Button>
          </div>

          <div className="p-4 rounded-lg bg-muted/10 border border-muted/20">
            <p className="text-xs text-muted-foreground">
              Use &quot;Switch Account&quot; to select a different MetaMask
              account. Use &quot;Disconnect&quot; to remove this site from
              MetaMask.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
````

## File: genlayer-project-boilerplate/frontend/components/AddressDisplay.tsx
````typescript
"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatAddress } from "@/lib/genlayer/wallet";
import { success, error } from "@/lib/utils/toast";

interface AddressDisplayProps {
  address: string | null;
  maxLength?: number;
  className?: string;
  showCopy?: boolean;
}

/**
 * Component to display shortened blockchain addresses with tooltip
 * Ported from Vue Address.vue component
 */
export function AddressDisplay({
  address,
  maxLength = 12,
  className = "",
  showCopy = false,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return <span className={className}>—</span>;
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success("Address copied!");
    } catch (err) {
      console.error("Failed to copy address:", err);
      error("Failed to copy address", {
        description: "Please copy manually or try again."
      });
    }
  };

  const shortened = formatAddress(address, maxLength);

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={address}
    >
      <span className="font-mono">{shortened}</span>
      {showCopy && (
        <button
          onClick={handleCopy}
          className="opacity-50 hover:opacity-100 transition-opacity p-0.5 hover:bg-white/5 rounded"
          aria-label="Copy address"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </span>
  );
}
````

## File: genlayer-project-boilerplate/frontend/components/BetsTable.tsx
````typescript
"use client";

import { Loader2, Trophy, Clock, AlertCircle } from "lucide-react";
import { useBets, useResolveBet, useFootballBetsContract } from "@/lib/hooks/useFootballBets";
import { useWallet } from "@/lib/genlayer/wallet";
import { error } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { Bet } from "@/lib/contracts/types";

export function BetsTable() {
  const contract = useFootballBetsContract();
  const { data: bets, isLoading, isError } = useBets();
  const { address, isConnected, isLoading: isWalletLoading } = useWallet();
  const { resolveBet, isResolving, resolvingBetId } = useResolveBet();

  const handleResolve = (betId: string) => {
    if (!address) {
      error("Please connect your wallet to resolve bets");
      return;
    }

    // Confirmation popup
    const confirmed = confirm("Are you sure you want to resolve this bet? This action will determine the winner.");

    if (confirmed) {
      resolveBet(betId);
    }
  };

  if (isLoading) {
    return (
      <div className="brand-card p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading bets...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-yellow-400 opacity-60" />
          <h3 className="text-xl font-bold">Setup Required</h3>
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Contract address not configured.
            </p>
            <p className="text-sm text-muted-foreground">
              Please set <code className="bg-muted px-1 py-0.5 rounded text-xs">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in your .env file.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="brand-card p-8">
        <div className="text-center">
          <p className="text-destructive">Failed to load bets. Please try again.</p>
        </div>
      </div>
    );
  }

  if (!bets || bets.length === 0) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-3">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
          <h3 className="text-xl font-bold">No Bets Yet</h3>
          <p className="text-muted-foreground">
            Be the first to create a football prediction bet!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-card p-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Teams
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Prediction
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Owner
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {bets.map((bet) => (
              <BetRow
                key={bet.id}
                bet={bet}
                currentAddress={address}
                isConnected={isConnected}
                isWalletLoading={isWalletLoading}
                onResolve={handleResolve}
                isResolving={isResolving && resolvingBetId === bet.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface BetRowProps {
  bet: Bet;
  currentAddress: string | null;
  isConnected: boolean;
  isWalletLoading: boolean;
  onResolve: (betId: string) => void;
  isResolving: boolean;
}

// Helper function to format prediction/winner display
function formatWinner(winnerCode: string, team1?: string, team2?: string): string {
  if (winnerCode === "1") return team1 || "Team 1";
  if (winnerCode === "2") return team2 || "Team 2";
  if (winnerCode === "0") return "Draw";
  return winnerCode;
}

// Helper function to get badge color for prediction
function getPredictionColor(winnerCode: string): string {
  if (winnerCode === "0") return "text-yellow-400 border-yellow-500/30";
  return "text-accent border-accent/30";
}

function BetRow({ bet, currentAddress, isConnected, isWalletLoading, onResolve, isResolving }: BetRowProps) {
  const isOwner = currentAddress?.toLowerCase() === bet.owner?.toLowerCase();
  const canResolve = isConnected && currentAddress && isOwner && !bet.has_resolved && !isWalletLoading;

  return (
    <tr className="group hover:bg-white/5 transition-colors animate-fade-in">
      <td className="px-4 py-4">
        <span className="text-sm">{bet.game_date}</span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{bet.team1}</span>
          <span className="text-xs text-muted-foreground">vs</span>
          <span className="text-sm font-semibold">{bet.team2}</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <Badge variant="outline" className={getPredictionColor(bet.predicted_winner)}>
          {formatWinner(bet.predicted_winner, bet.team1, bet.team2)}
        </Badge>
      </td>
      <td className="px-4 py-4">
        {bet.has_resolved ? (
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <Trophy className="w-3 h-3 mr-1" />
              Resolved
            </Badge>
            {bet.real_winner && (
              <span className="text-xs text-muted-foreground">
                Winner: <span className={`font-semibold ${bet.real_winner === "0" ? "text-yellow-400" : "text-foreground"}`}>
                  {formatWinner(bet.real_winner, bet.team1, bet.team2)}
                </span>
              </span>
            )}
          </div>
        ) : (
          <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <AddressDisplay address={bet.owner} maxLength={10} showCopy={true} />
          {isOwner && (
            <Badge variant="secondary" className="text-xs">
              You
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        {canResolve && (
          <Button
            onClick={() => onResolve(bet.id)}
            disabled={isResolving}
            size="sm"
            variant="gradient"
          >
            {isResolving ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Resolving...
              </>
            ) : (
              "Resolve"
            )}
          </Button>
        )}
      </td>
    </tr>
  );
}
````

## File: genlayer-project-boilerplate/frontend/components/CreateBetModal.tsx
````typescript
"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, Calendar, Users } from "lucide-react";
import { useCreateBet } from "@/lib/hooks/useFootballBets";
import { useWallet } from "@/lib/genlayer/wallet";
import { success, error } from "@/lib/utils/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function CreateBetModal() {
  const { isConnected, address, isLoading } = useWallet();
  const { createBet, isCreating, isSuccess } = useCreateBet();

  const [isOpen, setIsOpen] = useState(false);
  const [gameDate, setGameDate] = useState("");
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [predictedWinner, setPredictedWinner] = useState<"1" | "2" | "0" | "">("");

  const [errors, setErrors] = useState({
    gameDate: "",
    team1: "",
    team2: "",
    predictedWinner: "",
  });

  // Auto-close modal when wallet disconnects
  // Don't close if transaction is in progress to avoid interrupting user
  useEffect(() => {
    if (!isConnected && isOpen && !isCreating) {
      setIsOpen(false);
    }
  }, [isConnected, isOpen, isCreating]);

  const validateForm = (): boolean => {
    const newErrors = {
      gameDate: "",
      team1: "",
      team2: "",
      predictedWinner: "",
    };

    if (!gameDate.trim()) {
      newErrors.gameDate = "Game date is required";
    }

    if (!team1.trim()) {
      newErrors.team1 = "Team 1 name is required";
    }

    if (!team2.trim()) {
      newErrors.team2 = "Team 2 name is required";
    }

    if (!predictedWinner) {
      newErrors.predictedWinner = "Please select your predicted winner";
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some((error) => error !== "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      error("Please connect your wallet first");
      return;
    }

    if (!validateForm()) {
      return;
    }

    createBet({
      gameDate,
      team1,
      team2,
      predictedWinner: predictedWinner, // Send "1", "2", or "0" directly
    });
  };

  const resetForm = () => {
    setGameDate("");
    setTeam1("");
    setTeam2("");
    setPredictedWinner("");
    setErrors({ gameDate: "", team1: "", team2: "", predictedWinner: "" });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isCreating) {
      resetForm();
    }
    setIsOpen(open);
  };

  // Reset form and close modal on successful bet creation
  useEffect(() => {
    if (isSuccess) {
      resetForm();
      setIsOpen(false);
    }
  }, [isSuccess]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="gradient" disabled={!isConnected || !address || isLoading}>
          <Plus className="w-4 h-4 mr-2" />
          Create Bet
        </Button>
      </DialogTrigger>
      <DialogContent className="brand-card border-2 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create Football Bet</DialogTitle>
          <DialogDescription>
            Make your prediction for an upcoming football match
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Game Date */}
          <div className="space-y-2">
            <Label htmlFor="gameDate" className="flex items-center gap-2">
              <Calendar className="w-4 h-4 !text-white" />
              Game Date
            </Label>
            <Input
              id="gameDate"
              type="date"
              value={gameDate}
              onChange={(e) => {
                setGameDate(e.target.value);
                setErrors({ ...errors, gameDate: "" });
              }}
              className={errors.gameDate ? "border-destructive" : ""}
            />
            {errors.gameDate && (
              <p className="text-xs text-destructive">{errors.gameDate}</p>
            )}
          </div>

          {/* Teams */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Teams
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Input
                  id="team1"
                  type="text"
                  placeholder="Team 1"
                  value={team1}
                  onChange={(e) => {
                    setTeam1(e.target.value);
                    setErrors({ ...errors, team1: "" });
                  }}
                  className={errors.team1 ? "border-destructive" : ""}
                />
                {errors.team1 && (
                  <p className="text-xs text-destructive">{errors.team1}</p>
                )}
              </div>
              <div className="space-y-2">
                <Input
                  id="team2"
                  type="text"
                  placeholder="Team 2"
                  value={team2}
                  onChange={(e) => {
                    setTeam2(e.target.value);
                    setErrors({ ...errors, team2: "" });
                  }}
                  className={errors.team2 ? "border-destructive" : ""}
                />
                {errors.team2 && (
                  <p className="text-xs text-destructive">{errors.team2}</p>
                )}
              </div>
            </div>
          </div>

          {/* Predicted Winner */}
          <div className="space-y-3">
            <Label>Your Prediction</Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPredictedWinner("1");
                  setErrors({ ...errors, predictedWinner: "" });
                }}
                disabled={!team1.trim()}
                className={`p-4 rounded-lg border-2 transition-all ${
                  predictedWinner === "1"
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-white/10 hover:border-white/20"
                } ${!team1.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-semibold text-sm">{team1 || "Team 1"}</div>
                <div className="text-xs text-muted-foreground mt-1">Wins</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPredictedWinner("0");
                  setErrors({ ...errors, predictedWinner: "" });
                }}
                disabled={!team1.trim() || !team2.trim()}
                className={`p-4 rounded-lg border-2 transition-all ${
                  predictedWinner === "0"
                    ? "border-yellow-500 bg-yellow-500/20 text-yellow-400"
                    : "border-white/10 hover:border-white/20"
                } ${!team1.trim() || !team2.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-semibold text-sm">Draw</div>
                <div className="text-xs text-muted-foreground mt-1">Tie</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPredictedWinner("2");
                  setErrors({ ...errors, predictedWinner: "" });
                }}
                disabled={!team2.trim()}
                className={`p-4 rounded-lg border-2 transition-all ${
                  predictedWinner === "2"
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-white/10 hover:border-white/20"
                } ${!team2.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-semibold text-sm">{team2 || "Team 2"}</div>
                <div className="text-xs text-muted-foreground mt-1">Wins</div>
              </button>
            </div>
            {errors.predictedWinner && (
              <p className="text-xs text-destructive">{errors.predictedWinner}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gradient"
              className="flex-1"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Bet"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
````

## File: genlayer-project-boilerplate/frontend/components/Leaderboard.tsx
````typescript
"use client";

import { Trophy, Medal, Award, Loader2, AlertCircle } from "lucide-react";
import { useLeaderboard, useFootballBetsContract } from "@/lib/hooks/useFootballBets";
import { useWallet } from "@/lib/genlayer/wallet";
import { AddressDisplay } from "./AddressDisplay";

export function Leaderboard() {
  const contract = useFootballBetsContract();
  const { data: leaderboard, isLoading, isError } = useLeaderboard();
  const { address } = useWallet();

  if (isLoading) {
    return (
      <div className="brand-card p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Leaderboard
        </h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Leaderboard
        </h2>
        <div className="text-center py-8 space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto text-yellow-400 opacity-60" />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Setup Required</p>
            <p className="text-xs text-muted-foreground">Contract address not configured</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !leaderboard) {
    return (
      <div className="brand-card p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Leaderboard
        </h2>
        <div className="text-center py-8">
          <p className="text-sm text-destructive">Failed to load leaderboard</p>
        </div>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="brand-card p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Leaderboard
        </h2>
        <div className="text-center py-8">
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-3" />
          <p className="text-sm text-muted-foreground">No players yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-card p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-accent" />
        Leaderboard
      </h2>

      <div className="space-y-2">
        {leaderboard.map((entry, index) => {
          const isCurrentUser = address?.toLowerCase() === entry.address?.toLowerCase();
          const rank = index + 1;

          return (
            <div
              key={entry.address}
              className={`
                flex items-center gap-3 p-3 rounded-lg transition-all
                ${isCurrentUser ? "bg-accent/20 border-2 border-accent/50" : "hover:bg-white/5"}
              `}
            >
              {/* Rank with Icon */}
              <div className="flex-shrink-0 w-8 flex items-center justify-center">
                {rank === 1 && (
                  <Trophy className="w-5 h-5 text-yellow-400" />
                )}
                {rank === 2 && (
                  <Medal className="w-5 h-5 text-gray-400" />
                )}
                {rank === 3 && (
                  <Award className="w-5 h-5 text-amber-600" />
                )}
                {rank > 3 && (
                  <span className="text-sm font-bold text-muted-foreground">
                    #{rank}
                  </span>
                )}
              </div>

              {/* Address */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <AddressDisplay
                    address={entry.address}
                    maxLength={10}
                    className="text-sm"
                    showCopy={true}
                  />
                  {isCurrentUser && (
                    <span className="text-xs bg-accent/30 text-accent px-2 py-0.5 rounded-full font-semibold">
                      You
                    </span>
                  )}
                </div>
              </div>

              {/* Points */}
              <div className="flex-shrink-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-accent">
                    {entry.points}
                  </span>
                  <span className="text-xs text-muted-foreground">pts</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {leaderboard.length > 10 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs text-center text-muted-foreground">
            Showing top {Math.min(10, leaderboard.length)} players
          </p>
        </div>
      )}
    </div>
  );
}
````

## File: genlayer-project-boilerplate/frontend/components/Logo.tsx
````typescript
/**
 * GenLayer Logo Component
 * Per Brand Guidelines 2025
 *
 * Variants:
 * - "full": Strong Mark + Wordmark (for desktop/larger spaces)
 * - "mark": Strong Mark only (for mobile/compact spaces)
 * - "wordmark": Wordmark only (for specific cases)
 */

import React from 'react';

export type LogoVariant = 'full' | 'mark' | 'wordmark';
export type LogoSize = 'sm' | 'md' | 'lg';
export type LogoTheme = 'light' | 'dark';

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  theme?: LogoTheme;
  className?: string;
}

const sizeMap = {
  sm: { mark: 'w-5 h-5', text: 'text-base' },
  md: { mark: 'w-6 h-6', text: 'text-xl' },
  lg: { mark: 'w-8 h-8', text: 'text-2xl' },
};

export function Logo({
  variant = 'full',
  size = 'md',
  theme = 'dark',
  className = '',
}: LogoProps) {
  const colorClass = theme === 'dark' ? 'text-foreground' : 'text-background';
  const { mark: markSize, text: textSize } = sizeMap[size];

  // GenLayer Strong Mark (Triangle/Hands symbol)
  const StrongMark = () => (
    <svg
      className={`${markSize} ${colorClass} transition-colors`}
      viewBox="0 0 97.76 91.93"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GenLayer Logo"
    >
      <path
        fill="currentColor"
        d="M44.26 32.35L27.72 67.12L43.29 74.9L0 91.93L44.26 0L44.26 32.35ZM53.5 32.35L70.04 67.12L54.47 74.9L97.76 91.93L53.5 0L53.5 32.35ZM48.64 43.78L58.33 62.94L48.64 67.69L39.47 62.92L48.64 43.78Z"
      />
    </svg>
  );

  // Wordmark (using Space Grotesk from layout)
  const Wordmark = () => (
    <span
      className={`${textSize} font-bold ${colorClass} font-[family-name:var(--font-display)] transition-colors`}
      style={{ letterSpacing: '-0.02em' }}
    >
      GenLayer
    </span>
  );

  if (variant === 'mark') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <StrongMark />
      </div>
    );
  }

  if (variant === 'wordmark') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <Wordmark />
      </div>
    );
  }

  // Full logo (default): Strong Mark + Wordmark
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <StrongMark />
      <Wordmark />
    </div>
  );
}

// Convenience components for common use cases
export function LogoFull(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="full" />;
}

export function LogoMark(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="mark" />;
}

export function LogoWordmark(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="wordmark" />;
}
````

## File: genlayer-project-boilerplate/frontend/components/Navbar.tsx
````typescript
"use client";

import { useState, useEffect } from "react";
import { AccountPanel } from "./AccountPanel";
import { CreateBetModal } from "./CreateBetModal";
import { useBets } from "@/lib/hooks/useFootballBets";
import { Logo, LogoMark } from "./Logo";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const { data: bets } = useBets();

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const threshold = 80;

      setIsScrolled(scrollY > 20);

      // Calculate progress from 0 to 1 for smoother animations
      const progress = Math.min(Math.max((scrollY - 10) / threshold, 0), 1);
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Minimal variant with scroll animations
  const paddingTop = Math.round(scrollProgress * 16); // 0-16px padding
  const headerHeight = 64 - Math.round(scrollProgress * 8); // 64px to 56px

  // Only apply border radius on desktop (md breakpoint and up)
  const getBorderRadius = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      return Math.round(scrollProgress * 9999); // Fully rounded when scrolled on desktop
    }
    return 0; // No rounding on mobile
  };
  const borderRadius = getBorderRadius();

  const totalBets = bets?.length || 0;
  const resolvedBets = bets?.filter(bet => bet.has_resolved).length || 0;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out"
      style={{ paddingTop: `${paddingTop}px` }}
    >
      <div
        className="transition-all duration-500 ease-out"
        style={{
          width: '100%',
          maxWidth: isScrolled ? '80rem' : '100%',
          margin: '0 auto',
          borderRadius: `${borderRadius}px`,
        }}
      >
        <div
          className="backdrop-blur-xl border transition-all duration-500 ease-out md:rounded-none"
          style={{
            borderColor: `oklch(0.3 0.02 0 / ${0.4 + scrollProgress * 0.4})`,
            background: `linear-gradient(135deg, oklch(0.18 0.01 0 / ${0.1 + scrollProgress * 0.3}) 0%, oklch(0.15 0.01 0 / ${0.05 + scrollProgress * 0.25}) 50%, oklch(0.16 0.01 0 / ${0.08 + scrollProgress * 0.27}) 100%)`,
            borderRadius: `${borderRadius}px`,
            borderWidth: '1px',
            borderLeftWidth: isScrolled ? '1px' : '0px',
            borderRightWidth: isScrolled ? '1px' : '0px',
            borderTopWidth: isScrolled ? '1px' : '0px',
            boxShadow: isScrolled
              ? '0 32px 64px 0 rgba(0, 0, 0, 0.2), inset 0 1px 0 0 oklch(0.3 0.02 0 / 0.3)'
              : 'none',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          }}
        >
          <div
            className="px-6 transition-all duration-500 mx-auto"
            style={{
              maxWidth: isScrolled ? '80rem' : '112rem',
            }}
          >
            <div
              className="flex items-center justify-between transition-all duration-500"
              style={{ height: `${headerHeight}px` }}
            >
              {/* Left: Logo */}
              <div className="flex items-center gap-3">
                {/* Show mark only on mobile, full logo on desktop */}
                <LogoMark size="md" className="flex md:hidden" />
                <Logo size="md" className="hidden md:flex" />
                <span className="text-lg md:text-xl font-bold ml-2">Football Market</span>
              </div>

              {/* Center: Stats */}
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Total Bets:</span>
                  <span className="text-foreground font-bold text-accent">{totalBets}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Resolved:</span>
                  <span className="text-foreground font-bold text-accent">{resolvedBets}</span>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-3">
                <CreateBetModal />
                <AccountPanel />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
````

## File: genlayer-project-boilerplate/frontend/.env.example
````
# GenLayer RPC API URL
# Default: https://studio.genlayer.com/api
# Use this default for production, or provide your own GenLayer node URL for local development
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api

# GenLayer Network Configuration
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN

# GenLayer Football Betting Contract Address
# This is the address of your deployed FootballBets contract on GenLayer
NEXT_PUBLIC_CONTRACT_ADDRESS=your_contract_address
````

## File: genlayer-project-boilerplate/frontend/package.json
````json
{
  "name": "genlayer-football-betting",
  "version": "1.0.0",
  "description": "GenLayer Football Betting - AI-powered prediction betting on GenLayer blockchain.",
  "main": "index.js",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-slot": "^1.2.3",
    "@tanstack/react-query": "^5.90.5",
    "@wagmi/connectors": "^6.1.3",
    "@wagmi/core": "^2.22.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "genlayer-js": "^0.18.3",
    "lucide-react": "^0.548.0",
    "next": "^16.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "sonner": "^1.7.1",
    "tailwind-merge": "^3.3.1",
    "viem": "2.21.54",
    "wagmi": "^2.19.2"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.16",
    "@types/node": "^24.9.1",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.16",
    "typescript": "^5.9.3"
  }
}
````

## File: genlayer-project-boilerplate/frontend/README.md
````markdown
# GenLayer Football Market

Next.js frontend for GenLayer Football Market - AI-powered football match predictions on GenLayer blockchain.

## Setup

1. Install dependencies:

**Using bun:**
```bash
bun install
```

**Using npm:**
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` - GenLayer Football Betting contract address
   - `NEXT_PUBLIC_STUDIO_URL` - GenLayer Studio URL (default: https://studio.genlayer.com/api)

## Development

**Using bun:**
```bash
bun dev
```

**Using npm:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

**Using bun:**
```bash
bun run build
bun start
```

**Using npm:**
```bash
npm run build
npm start
```

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling with custom glass-morphism theme
- **genlayer-js** - GenLayer blockchain SDK
- **TanStack Query (React Query)** - Data fetching and caching
- **Radix UI** - Accessible component primitives
- **shadcn/ui** - Pre-built UI components

## Wallet Management

The app uses GenLayer's account system:
- **Create Account**: Generate a new private key
- **Import Account**: Import existing private key
- **Export Account**: Export your private key (secured)
- **Disconnect**: Clear stored account data

Accounts are stored in browser's localStorage for development convenience.

## Features

- **Create Bets**: Create football match predictions with team names, game date, and predicted winner (Team 1, Team 2, or Draw)
- **View Bets**: Real-time bet table with match details, predictions, status, and owners
- **Resolve Bets**: Bet owners can resolve matches using GenLayer's AI to verify actual results
- **Leaderboard**: Track top players by points earned from correct predictions
- **Player Stats**: View your points and ranking in the community
- **Glass-morphism UI**: Premium dark theme with OKLCH colors, backdrop blur effects, and smooth animations
- **Real-time Updates**: Automatic data fetching with 3-second polling intervals via TanStack Query
````

## File: genlayer-project-boilerplate/frontend/tailwind.config.ts
````typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
````

## File: genlayer-project-boilerplate/CLAUDE.md
````markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

```bash
npm run deploy          # Deploy contracts via GenLayer CLI
npm run dev             # Start frontend dev server (cd frontend && npm run dev)
npm run build           # Build frontend for production
gltest                  # Run contract tests (requires GenLayer Studio running)
genlayer network        # Select network (studionet/localnet/testnet)
```

## Architecture

```
contracts/          # Python intelligent contracts
frontend/           # Next.js 15 app (TypeScript, TanStack Query, Radix UI)
deploy/             # TypeScript deployment scripts
test/               # Python integration tests (gltest)
```

**Frontend stack**: Next.js 15, React 19, TypeScript, Tailwind CSS, TanStack Query, Wagmi/Viem, MetaMask wallet integration.

## Development Workflow

1. Ensure GenLayer Studio is running (local or https://studio.genlayer.com)
2. Select network: `genlayer network`
3. Deploy contract: `npm run deploy`
4. Copy deployed address to `frontend/.env` as `NEXT_PUBLIC_CONTRACT_ADDRESS`
5. Run frontend: `cd frontend && bun dev`

## Contract Development

Contracts are Python files in `/contracts/` using the GenLayer SDK:

```python
from genlayer import *

class MyContract(gl.Contract):
    data: TreeMap[Address, str]  # Storage declaration

    def __init__(self):
        self.data = TreeMap()

    @gl.public.view
    def get_data(self, addr: Address) -> str:
        return self.data.get(addr, "")

    @gl.public.write
    def set_data(self, value: str):
        self.data[gl.message.sender_address] = value
```

**Decorators**:
- `@gl.public.view` - Read-only methods
- `@gl.public.write` - State-modifying methods
- `@gl.public.write.payable` - Methods accepting value

**Storage types**: `TreeMap`, `DynArray`, `Array`, `@allow_storage` for custom classes

## Frontend Patterns

- Contract interactions: `frontend/lib/contracts/FootballBets.ts`
- React hooks: `frontend/lib/hooks/useFootballBets.ts`
- Wallet context: `frontend/lib/genlayer/WalletProvider.tsx`
- GenLayer client: `frontend/lib/genlayer/client.ts`

---

## GenLayer Technical Reference

> **Can't solve an issue?** Always check the complete SDK API reference:
> **https://sdk.genlayer.com/main/_static/ai/api.txt**
>
> Contains: all classes, methods, parameters, return types, changelogs, breaking changes.

### Documentation URLs

| Resource | URL |
|----------|-----|
| **SDK API (Complete)** | https://sdk.genlayer.com/main/_static/ai/api.txt |
| Full Documentation | https://docs.genlayer.com/full-documentation.txt |
| Main Docs | https://docs.genlayer.com/ |
| GenLayerJS SDK | https://docs.genlayer.com/api-references/genlayer-js |

### What is GenLayer?

GenLayer is an AI-native blockchain where smart contracts can natively access the internet and make decisions using AI (LLMs). Contracts are Python-based and executed in the GenVM.

### Web Access (`gl.nondet.web`)

```python
gl.nondet.web.get(url: str, *, headers: dict = {}) -> Response
gl.nondet.web.post(url: str, *, body: str | bytes | None = None, headers: dict = {}) -> Response
gl.nondet.web.render(url: str, *, mode: Literal['text', 'html']) -> str
gl.nondet.web.render(url: str, *, mode: Literal['screenshot']) -> Image
```

### LLM Access (`gl.nondet`)

```python
gl.nondet.exec_prompt(prompt: str, *, images: Sequence[bytes | Image] | None = None) -> str
gl.nondet.exec_prompt(prompt: str, *, response_format: Literal['json'], image: bytes | Image | None = None) -> dict
```

### Equivalence Principle

Validation for non-deterministic outputs:

| Type | Use Case | Function |
|------|----------|----------|
| Strict | Exact outputs | `gl.eq_principle.strict_eq()` |
| Comparative | Similar outputs | `gl.eq_principle.prompt_comparative()` |
| Non-Comparative | Subjective assessments | `gl.eq_principle.prompt_non_comparative()` |

### Key Documentation Links

- [Introduction to Intelligent Contracts](https://docs.genlayer.com/developers/intelligent-contracts/introduction)
- [Storage](https://docs.genlayer.com/developers/intelligent-contracts/storage)
- [Deploying Contracts](https://docs.genlayer.com/developers/intelligent-contracts/deploying)
- [Crafting Prompts](https://docs.genlayer.com/developers/intelligent-contracts/crafting-prompts)
- [Contract Examples](https://docs.genlayer.com/developers/intelligent-contracts/examples/storage)
- [Testing Contracts](https://docs.genlayer.com/developers/decentralized-applications/testing)
````

## File: genlayer-project-boilerplate/LICENSE
````
MIT License

Copyright (c) 2024 YeagerAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
````

## File: genlayer-project-boilerplate/package.json
````json
{
  "name": "genlayer-project",
  "type": "module",
  "private": true,
  "workspaces": ["frontend"],
  "scripts": {
    "dev": "cd frontend && npm run dev",
    "build": "cd frontend && npm run build",
    "start": "cd frontend && npm run start",
    "lint": "cd frontend && npm run lint",
    "deploy": "genlayer deploy"
  },
  "devDependencies": {
    "genlayer-js": "^0.18.3"
  }
}
````

## File: genlayer-project-boilerplate/README.md
````markdown
# Sample GenLayer project
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/license/mit/)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/8Jm4v89VAu)
[![Telegram](https://img.shields.io/badge/Telegram--T.svg?style=social&logo=telegram)](https://t.me/genlayer)
[![Twitter](https://img.shields.io/twitter/url/https/twitter.com/yeagerai.svg?style=social&label=Follow%20%40GenLayer)](https://x.com/GenLayer)
[![GitHub star chart](https://img.shields.io/github/stars/yeagerai/genlayer-project-boilerplate?style=social)](https://star-history.com/#yeagerai/genlayer-js)

## 👀 About
This project includes the boilerplate code for a GenLayer use case implementation, specifically a football bets game.

## 📦 What's included
- Basic requirements to deploy and test your intelligent contracts locally
- Configuration file template
<!-- - Test functions to write complete end-to-end tests -->
- An example of an intelligent contract (Football Bets)
- Example end-to-end tests for the contract provided
- A production-ready Next.js 15 frontend with TypeScript, TanStack Query, and Radix UI

## 🛠️ Requirements
- A running GenLayer Studio (Install from [Docs](https://docs.genlayer.com/developers/intelligent-contracts/tooling-setup#using-the-genlayer-studio) or work with the hosted version of [GenLayer Studio](https://studio.genlayer.com/)). If you are working locally, this repository code does not need to be located in the same directory as the Genlayer Studio.
- [GenLayer CLI](https://github.com/genlayerlabs/genlayer-cli) globally installed. To install or update the GenLayer CLI run `npm install -g genlayer`

## 🚀 Steps to run this example

### 1. Deploy the contract
   Deploy the contract from `/contracts/football_bets.py` using the GenLayer CLI:
   1. Choose the network that you want to use (studionet, localnet, or tesnet-*): `genlayer network`
   2. Execute the deploy command `genlayer deploy`. This command is going to execute the deploy script located in `/deploy/deployScript.ts`

### 2. Setup the frontend environment
  1. All the content of the dApp is located in the `/frontend` folder.
  2. Copy the `.env.example` file in the `frontend` folder and rename it to `.env`, then fill in the values for your configuration. The provided NEXT_PUBLIC_GENLAYER_RPC_URL value is the backend of the hosted GenLayer Studio.
  3. Add the deployed contract address to the `/frontend/.env` under the variable `NEXT_PUBLIC_CONTRACT_ADDRESS`

### 4. Run the frontend Next.js app
   Execute the following commands in your terminal:

   **Using bun:**
   ```shell
   cd frontend
   bun install
   bun dev
   ```

   **Using npm:**
   ```shell
   cd frontend
   npm install
   npm run dev
   ```

   The terminal should display a link to access your frontend app (usually at <http://localhost:3000/>).
   For more information on the code see [GenLayerJS](https://github.com/yeagerai/genlayer-js).
   
### 5. Test contracts
1. Install the Python packages listed in the `requirements.txt` file in a virtual environment.
2. Make sure your GenLayer Studio is running. Then execute the following command in your terminal:
   ```shell
   gltest
   ```

## ⚽ How the Football Bets Contract Works

The Football Bets contract allows users to create bets for football matches, resolve those bets, and earn points for correct bets. Here's a breakdown of its main functionalities:

1. Creating Bets:
   - Users can create a bet for a specific football match by providing the game date, team names, and their predicted winner.
   - The contract checks if the game has already finished and if the user has already made a bet for this match.

2. Resolving Bets:
   - After a match has concluded, users can resolve their bets.
   - The contract fetches the actual match result from a specified URL.
   - If the Bet was correct, the user earns a point.

3. Querying Data:
   - Users can retrieve all bets.
   - The contract also allows querying of points, either for all players or for a specific player.

4. Getting Points:
   - Points are awarded for correct bets.
   - Users can check their total points or the points of any player.

## 🧪 Tests

This project includes integration tests that interact with the contract deployed in the Studio. These tests cover the main functionalities of the Football Bets contract:

1. Creating a bet
2. Resolving a bet
3. Querying bets for a player
4. Querying points for a player

The tests simulate real-world interactions with the contract, ensuring that it behaves correctly under various scenarios. They use the GenLayer Studio to deploy and interact with the contract, providing a comprehensive check of the contract's functionality in a controlled environment.

To run the tests, use the `gltest` command as mentioned in the "Steps to run this example" section.


## 💬 Community
Connect with the GenLayer community to discuss, collaborate, and share insights:
- **[Discord Channel](https://discord.gg/8Jm4v89VAu)**: Our primary hub for discussions, support, and announcements.
- **[Telegram Group](https://t.me/genlayer)**: For more informal chats and quick updates.

Your continuous feedback drives better product development. Please engage with us regularly to test, discuss, and improve GenLayer.

## 📖 Documentation
For detailed information on how to use GenLayerJS SDK, please refer to our [documentation](https://docs.genlayer.com/).

## 📜 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
````

## File: genlayer-project-boilerplate/requirements.txt
````
requests==2.31.0
python-dotenv==1.0.1
eth-account==0.13.3
eth-utils==5.0.0
genlayer-test==0.1.1
````

## File: hackaclaw-app/src/app/api/v1/admin/hackathons/[id]/finalize/route.ts
````typescript
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateAdminRequest } from "@/lib/auth";
import { finalizeHackathonOnChain, normalizeAddress } from "@/lib/chain";
import { formatHackathon, loadHackathonLeaderboard, parseHackathonMeta, sanitizeString, serializeHackathonMeta } from "@/lib/hackathons";
import { error, notFound, success } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ id: string }> };

function getConfiguredChainId(): number | null {
  const parsed = Number.parseInt(process.env.CHAIN_ID || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * POST /api/v1/admin/hackathons/:id/finalize — Manually select a winner and optional scores.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!authenticateAdminRequest(req)) {
    return error("Admin authentication required", 401, "Add 'Authorization: Bearer <ADMIN_API_KEY>' header.");
  }

  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");

  const body = await req.json().catch(() => ({}));
  const winnerAgentId = sanitizeString(body.winner_agent_id, 64);
  if (!winnerAgentId) return error("winner_agent_id is required", 400);

  const meta = parseHackathonMeta(hackathon.judging_criteria);
  if (!meta.contract_address) {
    return error("Hackathon does not have a configured contract address", 400);
  }

  const { data: winningMembership } = await supabaseAdmin
    .from("team_members")
    .select("team_id, teams!inner(hackathon_id), agents!inner(wallet_address)")
    .eq("agent_id", winnerAgentId)
    .eq("teams.hackathon_id", hackathonId)
    .single();

  if (!winningMembership) return error("winner_agent_id is not registered in this hackathon", 400);

  const { data: winningTeam } = await supabaseAdmin
    .from("teams")
    .select("id, hackathon_id")
    .eq("id", winningMembership.team_id)
    .eq("hackathon_id", hackathonId)
    .single();

  if (!winningTeam) return error("winner_agent_id is not registered in this hackathon", 400);

  const winningAgent = winningMembership.agents as { wallet_address?: string | null } | null;
  if (!winningAgent?.wallet_address) {
    return error("Winning agent does not have a registered wallet address", 400);
  }

  let winnerWallet: string;
  try {
    winnerWallet = normalizeAddress(winningAgent.wallet_address);
  } catch {
    return error("Winning agent wallet address is invalid", 400);
  }

  let finalizeResult;
  try {
    finalizeResult = await finalizeHackathonOnChain({
      contractAddress: meta.contract_address,
      winnerWallet,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to finalize hackathon on-chain";
    return error(message, 400);
  }

  const finalizedAt = new Date().toISOString();
  const notes = sanitizeString(body.notes, 4000);

  const { data: updatedHackathon, error: updateErr } = await supabaseAdmin
    .from("hackathons")
    .update({
      status: "completed",
      updated_at: finalizedAt,
      judging_criteria: serializeHackathonMeta({
        ...meta,
        chain_id: meta.chain_id ?? getConfiguredChainId(),
        winner_agent_id: winnerAgentId,
        winner_team_id: winningTeam.id,
        finalization_notes: notes,
        finalized_at: finalizedAt,
        finalize_tx_hash: finalizeResult.txHash,
        scores: body.scores ?? meta.scores,
      }),
    })
    .eq("id", hackathonId)
    .select("*")
    .single();

  if (updateErr) return error("Failed to finalize hackathon", 500);

  await supabaseAdmin.from("teams").update({ status: "judged" }).eq("id", winningTeam.id);

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: hackathonId,
    team_id: winningTeam.id,
    agent_id: winnerAgentId,
    event_type: "hackathon_finalized",
    event_data: {
      winner_agent_id: winnerAgentId,
      winner_team_id: winningTeam.id,
      winner_wallet: winnerWallet,
      finalize_tx_hash: finalizeResult.txHash,
      contract_address: meta.contract_address,
      notes,
    },
  });

  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  return success({
    hackathon: formatHackathon(updatedHackathon as Record<string, unknown>),
    winner_agent_id: winnerAgentId,
    winner_team_id: winningTeam.id,
    notes,
    leaderboard,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/agents/me/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, unauthorized } from "@/lib/responses";
import { getBalance } from "@/lib/balance";

/**
 * GET /api/v1/agents/me
 * Get authenticated agent's profile + balance + hackathons, teams, and deploy links.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  // Get balance
  const balance = await getBalance(agent.id);

  // Get all teams this agent is in
  const { data: memberships } = await supabaseAdmin
    .from("team_members")
    .select("team_id, role, revenue_share_pct, teams(id, name, hackathon_id, status, color)")
    .eq("agent_id", agent.id);

  // For each team, get hackathon info and submission
  const hackathons = await Promise.all(
    (memberships || []).map(async (m) => {
      const team = (m as Record<string, unknown>).teams as Record<string, unknown> | null;
      if (!team) return null;

      const { data: hackathon } = await supabaseAdmin
        .from("hackathons")
        .select("id, title, status, entry_type, entry_fee, prize_pool, max_participants, challenge_type, build_time_seconds, github_repo")
        .eq("id", team.hackathon_id)
        .single();

      if (!hackathon) return null;

      // Get submission + score
      const { data: sub } = await supabaseAdmin
        .from("submissions")
        .select("id, status, project_type, file_count, languages")
        .eq("team_id", team.id)
        .eq("hackathon_id", hackathon.id)
        .single();

      let score = null;
      if (sub) {
        const { data: evalData } = await supabaseAdmin
          .from("evaluations")
          .select("total_score, judge_feedback")
          .eq("submission_id", sub.id)
          .single();
        score = evalData;
      }

      // Get latest prompt round (for github folder, round number, etc.)
      const { data: latestRound } = await supabaseAdmin
        .from("prompt_rounds")
        .select("round_number, llm_provider, llm_model, commit_sha, created_at")
        .eq("team_id", team.id)
        .eq("hackathon_id", hackathon.id)
        .order("round_number", { ascending: false })
        .limit(1)
        .single();

      // Build github folder URL for the agent's latest round
      let githubFolder = null;
      if (hackathon.github_repo && latestRound) {
        const teamSlug = (team.name as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
        githubFolder = `${hackathon.github_repo}/tree/main/${teamSlug}/round-${latestRound.round_number}`;
      }

      // Count current participants
      const { data: participants } = await supabaseAdmin
        .from("team_members")
        .select("agent_id, teams!inner(hackathon_id)")
        .eq("teams.hackathon_id", hackathon.id);
      const participantCount = new Set((participants || []).map((p: Record<string, unknown>) => p.agent_id)).size;

      return {
        hackathon_id: hackathon.id,
        hackathon_title: hackathon.title,
        hackathon_status: hackathon.status,
        challenge_type: hackathon.challenge_type,
        entry_fee: hackathon.entry_fee,
        prize_pool: hackathon.prize_pool,
        current_participants: participantCount,
        max_participants: hackathon.max_participants,
        team_id: team.id,
        team_name: team.name,
        team_status: team.status,
        my_role: m.role,
        my_revenue_share: m.revenue_share_pct,
        // GitHub repo — clone/browse the code your team generated
        github_repo: hackathon.github_repo || null,
        github_folder: githubFolder,
        current_round: latestRound?.round_number || 0,
        submission: sub ? {
          id: sub.id,
          status: sub.status,
          project_type: sub.project_type,
          file_count: sub.file_count,
          languages: sub.languages,
          preview_url: `/api/v1/submissions/${sub.id}/preview`,
          score: score?.total_score ?? null,
          feedback: score?.judge_feedback ?? null,
        } : null,
      };
    })
  );

  return success({
    agent: {
      id: agent.id,
      name: agent.name,
      display_name: agent.display_name,
      reputation_score: agent.reputation_score,
      total_hackathons: agent.total_hackathons,
      total_wins: agent.total_wins,
    },
    balance: {
      balance_usd: balance.balance_usd,
      total_deposited_usd: balance.total_deposited_usd,
      total_spent_usd: balance.total_spent_usd,
      total_fees_usd: balance.total_fees_usd,
    },
    hackathons: hackathons.filter(Boolean),
  });
}
````

## File: hackaclaw-app/src/app/api/v1/agents/register/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateApiKey, hashToken, authenticateRequest, toPublicAgent } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { sanitizeString } from "@/lib/hackathons";
import { v4 as uuid } from "uuid";

// Max field lengths to prevent abuse
const LIMITS = {
  name: 32,
  display_name: 64,
  description: 500,
  stack: 500,
  wallet_address: 128,
  model: 64,
  avatar_url: 512,
} as const;

/**
 * POST /api/v1/agents/register
 * Register a new agent. Returns API key (shown only once).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const metadata: Record<string, unknown> = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const name = sanitizeString(body.name, LIMITS.name);

    if (!name) {
      return error("name is required", 400);
    }

    const normalized = name.toLowerCase();

    if (normalized.length < 2) {
      return error("name must be at least 2 characters");
    }

    if (!/^[a-z0-9_]+$/.test(normalized)) {
      return error("name can only contain lowercase letters, numbers, and underscores");
    }

    // Reserved names
    const reserved = ["admin", "hackaclaw", "buildersclaw", "system", "api", "root", "null", "undefined", "test"];
    if (reserved.includes(normalized)) {
      return error("This name is reserved", 409);
    }

    // Check uniqueness
    const { data: existing } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("name", normalized)
      .single();

    if (existing) {
      return error("Name already taken", 409, "Try a different name");
    }

    const apiKey = generateApiKey();
    const keyHash = hashToken(apiKey);
    const id = uuid();

    const { error: insertErr } = await supabaseAdmin
      .from("agents")
      .insert({
        id,
        name: normalized,
        display_name: sanitizeString(body.display_name, LIMITS.display_name) || name,
        description: sanitizeString(metadata.description ?? body.description, LIMITS.description),
        avatar_url: sanitizeString(body.avatar_url, LIMITS.avatar_url),
        wallet_address: sanitizeString(body.wallet ?? body.wallet_address, LIMITS.wallet_address),
        api_key_hash: keyHash,
        model: sanitizeString(metadata.model ?? body.model, LIMITS.model) || "unknown",
        personality: null,
        strategy: sanitizeString(metadata.stack ?? body.stack ?? body.strategy, LIMITS.stack),
      });

    if (insertErr) {
      return error("Registration failed", 500);
    }

    return created({
      agent: {
        id,
        name: normalized,
        display_name: sanitizeString(body.display_name, LIMITS.display_name) || name,
        api_key: apiKey,
      },
      important: "Save your API key! It will not be shown again.",
    });
  } catch {
    return error("Invalid request body", 400);
  }
}

/**
 * GET /api/v1/agents/register
 * Get current agent profile (requires auth) or ?name=xxx for public lookup.
 */
export async function GET(req: NextRequest) {
  const nameParam = req.nextUrl.searchParams.get("name");

  if (nameParam) {
    // Sanitize lookup name
    const clean = nameParam.toLowerCase().trim().slice(0, 32);
    if (!/^[a-z0-9_]+$/.test(clean)) return error("Invalid agent name", 400);

    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("name", clean)
      .eq("status", "active")
      .single();

    if (!agent) return error("Agent not found", 404);
    return success(toPublicAgent(agent));
  }

  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();
  return success(toPublicAgent(agent));
}

/**
 * PATCH /api/v1/agents/register
 * Update own profile (requires auth).
 */
export async function PATCH(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  try {
    const body = await req.json();
    const metadata: Record<string, unknown> = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const updates: Record<string, unknown> = { last_active: new Date().toISOString() };

    const fieldLimits: Record<string, number> = {
      description: LIMITS.description,
      display_name: LIMITS.display_name,
      avatar_url: LIMITS.avatar_url,
      wallet_address: LIMITS.wallet_address,
      model: LIMITS.model,
    };

    for (const [field, maxLen] of Object.entries(fieldLimits)) {
      if (body[field] !== undefined) {
        updates[field] = sanitizeString(body[field], maxLen);
      }
    }

    const mappedDescription = sanitizeString(metadata.description, LIMITS.description);
    if (mappedDescription !== null) updates.description = mappedDescription;

    const mappedStack = sanitizeString(metadata.stack ?? body.stack, LIMITS.stack);
    if (mappedStack !== null) updates.strategy = mappedStack;

    const mappedModel = sanitizeString(metadata.model, LIMITS.model);
    if (mappedModel !== null) updates.model = mappedModel;

    const mappedWallet = sanitizeString(body.wallet, LIMITS.wallet_address);
    if (mappedWallet !== null) updates.wallet_address = mappedWallet;

    if (Object.keys(updates).length <= 1) return error("No valid fields to update");

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("agents")
      .update(updates)
      .eq("id", agent.id)
      .select("*")
      .single();

    if (updateErr) return error("Update failed", 500);
    return success(toPublicAgent(updated));
  } catch {
    return error("Invalid request body", 400);
  }
}
````

## File: hackaclaw-app/src/app/api/v1/balance/transactions/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getTransactions } from "@/lib/balance";
import { success, unauthorized } from "@/lib/responses";

/**
 * GET /api/v1/balance/transactions — Get transaction history.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const limit = Math.min(
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "50", 10) || 50),
    200
  );

  const transactions = await getTransactions(agent.id, limit);

  return success({
    agent_id: agent.id,
    transactions,
    count: transactions.length,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/activity/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, notFound } from "@/lib/responses";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/activity — Activity log.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("id").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const since = req.nextUrl.searchParams.get("since");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 200);

  let query = supabaseAdmin
    .from("activity_log")
    .select("*, agents(name, display_name), teams(name, color)")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data: events } = await query;

  // Flatten joined data
  const flat = (events || []).map((e: Record<string, unknown>) => {
    const agent = e.agents as Record<string, unknown> | null;
    const team = e.teams as Record<string, unknown> | null;
    return {
      ...e,
      agents: undefined, teams: undefined,
      agent_name: agent?.name, agent_display_name: agent?.display_name,
      team_name: team?.name, team_color: team?.color,
    };
  });

  return success(flat);
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/building/route.ts
````typescript
import { NextRequest } from "next/server";
import { loadHackathonLeaderboard } from "@/lib/hackathons";
import { supabaseAdmin } from "@/lib/supabase";
import { success, notFound } from "@/lib/responses";
import type { BuildingFloor, LobsterViz } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/building — Building visualization data.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const { data: teams } = await supabaseAdmin
    .from("teams").select("*")
    .eq("hackathon_id", hackathonId)
    .order("floor_number", { ascending: true });

  const leaderboard = await loadHackathonLeaderboard(hackathonId);
  const scoreByTeamId = new Map((leaderboard || []).map((entry) => [entry.team_id, entry.total_score]));

  const floors: BuildingFloor[] = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name)")
        .eq("team_id", team.id)
        .order("revenue_share_pct", { ascending: false });

      const score = scoreByTeamId.get(team.id) ?? null;

      const lobsters: LobsterViz[] = (members || []).map((m: Record<string, unknown>) => {
        const a = m.agents as Record<string, unknown> | null;
        const sharePct = m.revenue_share_pct as number;
        let size: "small" | "medium" | "large" = "small";
        if (sharePct >= 50) size = "large";
        else if (sharePct >= 20) size = "medium";

        return {
          agent_id: m.agent_id as string,
          agent_name: (a?.name as string) || "",
          display_name: (a?.display_name as string) || null,
          role: m.role as string,
          share_pct: sharePct,
          size,
        };
      });

      return {
        floor_number: team.floor_number,
        team_id: team.id,
        team_name: team.name,
        color: team.color,
        lobsters,
        // Each lobster that joins gets a desk. Prepared empty seats for future members (v2).
        // For now in v1 (solo mode), there's 1 lobster and 0 empty seats per floor.
        // When team formation is enabled, empty_seats = max_team_size - current_members.
        empty_seats: Math.max(0, (hackathon.team_size_max || 1) - lobsters.length),
        status: team.status,
        score,
      };
    })
  );

  return success({
    hackathon_id: hackathonId,
    hackathon_title: hackathon.title,
    status: hackathon.status,
    total_floors: floors.length,
    floors,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/leaderboard/route.ts
````typescript
import { NextRequest } from "next/server";
import { loadHackathonLeaderboard, calculatePrizePool } from "@/lib/hackathons";
import { notFound, success } from "@/lib/responses";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/leaderboard — Ranked submissions with winner flag + prize info.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  await req;
  const { id: hackathonId } = await params;
  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  if (!leaderboard) return notFound("Hackathon");

  const prize = await calculatePrizePool(hackathonId);

  return success({
    leaderboard,
    prize_pool: prize,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/[teamId]/join/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { error, unauthorized } from "@/lib/responses";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/join — Disabled in the single-agent MVP.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  await params;
  return error(
    "Team joining is disabled in the MVP. Each hackathon entry is a single-agent team.",
    410,
    "Use POST /api/v1/hackathons/:id/join instead."
  );
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { formatHackathon, parseHackathonMeta, sanitizeString, serializeHackathonMeta, toInternalHackathonStatus, calculatePrizePool } from "@/lib/hackathons";

function getConfiguredChainId(): number | null {
  const raw = process.env.CHAIN_ID;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id — Get full hackathon details with teams and members.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", id)
    .single();

  if (!hackathon) return notFound("Hackathon");

  // Get teams
  const { data: teams } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("hackathon_id", id)
    .order("floor_number", { ascending: true });

  // Enrich teams with members
  const enrichedTeams = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name, avatar_url)")
        .eq("team_id", team.id)
        .order("role", { ascending: true });

      const flatMembers = (members || []).map((m: Record<string, unknown>) => {
        const agent = m.agents as Record<string, unknown> | null;
        return {
          ...m,
          agents: undefined,
          agent_name: agent?.name,
          agent_display_name: agent?.display_name,
          agent_avatar_url: agent?.avatar_url,
        };
      });

      return { ...team, members: flatMembers };
    })
  );

  const totalAgents = enrichedTeams.reduce(
    (sum, t) => sum + t.members.length, 0
  );

  // Dynamic prize pool calculation
  const prize = await calculatePrizePool(id);

  return success({
    ...formatHackathon(hackathon as Record<string, unknown>),
    teams: enrichedTeams,
    total_teams: (teams || []).length,
    total_agents: totalAgents,
    prize_pool_dynamic: prize,
  });
}

/**
 * PATCH /api/v1/hackathons/:id — Update hackathon (only by creator).
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", id)
    .single();

  if (!hackathon) return notFound("Hackathon");
  if (hackathon.created_by !== agent.id) {
    return error("Only the hackathon creator can update it", 403);
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const meta = parseHackathonMeta(hackathon.judging_criteria);

  const directFields = ["title", "description", "brief", "rules", "starts_at", "ends_at", "entry_fee", "prize_pool", "max_participants"];
  for (const key of directFields) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (body.status !== undefined) {
    const mappedStatus = toInternalHackathonStatus(body.status);
    if (!mappedStatus) return error("status must be open, closed, or finalized", 400);
    updates.status = mappedStatus;
  }

  if (body.contract_address !== undefined || body.judging_criteria !== undefined) {
    updates.judging_criteria = serializeHackathonMeta({
      ...meta,
      chain_id: meta.chain_id ?? getConfiguredChainId(),
      contract_address:
        body.contract_address !== undefined ? sanitizeString(body.contract_address, 128) : meta.contract_address,
      criteria_text:
        body.judging_criteria !== undefined ? sanitizeString(body.judging_criteria, 4000) : meta.criteria_text,
    });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("hackathons")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) return error(updateErr.message, 500);
  return success(formatHackathon(updated as Record<string, unknown>));
}
````

## File: hackaclaw-app/src/app/api/v1/models/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { listModels } from "@/lib/openrouter";
import { success, error, unauthorized } from "@/lib/responses";
import { PLATFORM_FEE_PCT } from "@/lib/balance";

/**
 * GET /api/v1/models — List available OpenRouter models with pricing.
 *
 * Shows the actual model cost + our 5% fee so agents know what they'll pay.
 * Optional query params: ?search=claude&max_price=0.01
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  try {
    const models = await listModels();

    const search = req.nextUrl.searchParams.get("search")?.toLowerCase();
    const maxPrice = parseFloat(req.nextUrl.searchParams.get("max_price") || "") || null;

    let filtered = models;

    if (search) {
      filtered = filtered.filter(
        (m) =>
          m.id.toLowerCase().includes(search) ||
          m.name.toLowerCase().includes(search)
      );
    }

    // Map to our pricing format (model cost + 5% fee)
    const result = filtered.map((m) => {
      const promptPrice = parseFloat(m.pricing.prompt) || 0;
      const completionPrice = parseFloat(m.pricing.completion) || 0;

      const promptWithFee = promptPrice * (1 + PLATFORM_FEE_PCT);
      const completionWithFee = completionPrice * (1 + PLATFORM_FEE_PCT);

      return {
        id: m.id,
        name: m.name,
        description: m.description || null,
        context_length: m.context_length,
        pricing: {
          prompt_per_token: promptPrice,
          completion_per_token: completionPrice,
          prompt_per_million: promptPrice * 1_000_000,
          completion_per_million: completionPrice * 1_000_000,
        },
        pricing_with_fee: {
          prompt_per_token: promptWithFee,
          completion_per_token: completionWithFee,
          prompt_per_million: promptWithFee * 1_000_000,
          completion_per_million: completionWithFee * 1_000_000,
          fee_pct: PLATFORM_FEE_PCT,
        },
      };
    });

    // Filter by max price if specified
    const finalResult = maxPrice
      ? result.filter((m) => m.pricing.prompt_per_million <= maxPrice)
      : result;

    return success({
      models: finalResult.slice(0, 200),
      total: finalResult.length,
      platform_fee_pct: PLATFORM_FEE_PCT,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch models";
    return error(msg, 502);
  }
}
````

## File: hackaclaw-app/src/app/api/v1/submissions/[subId]/preview/route.ts
````typescript
import { NextRequest, NextResponse } from "next/server";
import { parseSubmissionMeta, sanitizeUrl } from "@/lib/hackathons";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ subId: string }> };

/**
 * GET /api/v1/submissions/:subId/preview — Serve raw HTML or redirect to submitted project URL.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
    return new NextResponse("<h1>Invalid submission ID</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("html_content, preview_url, build_log")
    .eq("id", subId)
    .single();

  if (!sub) {
    return new NextResponse("<h1>Submission not found</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  if (sub.html_content) {
    return new NextResponse(sub.html_content, {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy": "default-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors *;",
        "X-Content-Type-Options": "nosniff",
        "Set-Cookie": "",
      },
    });
  }

  const submissionMeta = parseSubmissionMeta(sub.build_log, sub.preview_url);
  const projectUrl = sanitizeUrl(submissionMeta.project_url ?? sub.preview_url);

  if (projectUrl) {
    return NextResponse.redirect(projectUrl, { status: 302 });
  }

  return new NextResponse("<h1>Submission preview is unavailable</h1>", {
    headers: { "Content-Type": "text/html" },
    status: 404,
  });
}
````

## File: hackaclaw-app/src/app/enterprise/enterprise-wallet-provider.tsx
````typescript
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { publicChain } from "@/lib/public-chain";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

type SponsorWallet = {
  address: string;
  getEthereumProvider: () => Promise<unknown>;
};

type EnterpriseWalletContextValue = {
  walletFeatureAvailable: boolean;
  ready: boolean;
  authenticated: boolean;
  connectedWallet: SponsorWallet | null;
  openWalletModal: () => void;
};

const fallbackValue: EnterpriseWalletContextValue = {
  walletFeatureAvailable: false,
  ready: false,
  authenticated: false,
  connectedWallet: null,
  openWalletModal: () => {},
};

const EnterpriseWalletContext = createContext<EnterpriseWalletContextValue>(fallbackValue);

function PrivyWalletBridge({ children }: { children: ReactNode }) {
  const { ready: privyReady, authenticated, login, linkWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const connectedWallet = (wallets[0] ?? null) as SponsorWallet | null;

  const value = useMemo<EnterpriseWalletContextValue>(() => ({
    walletFeatureAvailable: true,
    ready: privyReady && walletsReady,
    authenticated,
    connectedWallet,
    openWalletModal: () => {
      if (connectedWallet) return;
      if (authenticated) {
        linkWallet({ walletChainType: "ethereum-only" });
        return;
      }
      login();
    },
  }), [authenticated, connectedWallet, linkWallet, login, privyReady, walletsReady]);

  return <EnterpriseWalletContext.Provider value={value}>{children}</EnterpriseWalletContext.Provider>;
}

export function EnterpriseWalletProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <EnterpriseWalletContext.Provider value={fallbackValue}>{children}</EnterpriseWalletContext.Provider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        supportedChains: [publicChain],
        defaultChain: publicChain,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
}

export function useEnterpriseWallet() {
  return useContext(EnterpriseWalletContext);
}
````

## File: hackaclaw-app/src/app/enterprise/layout.tsx
````typescript
import type { ReactNode } from "react";
import { EnterpriseWalletProvider } from "./enterprise-wallet-provider";

export default function EnterpriseLayout({ children }: { children: ReactNode }) {
  return <EnterpriseWalletProvider>{children}</EnterpriseWalletProvider>;
}
````

## File: hackaclaw-app/.env.example
````
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_PLATFORM_WALLET=
NEXT_PUBLIC_CHAIN_ID=
NEXT_PUBLIC_RPC_URL=

RPC_URL=https://your-rpc-url
CHAIN_ID=1
ORGANIZER_PRIVATE_KEY=0xyour_organizer_private_key
ADMIN_API_KEY=your_admin_api_key

FACTORY_ADDRESS=your-factory-address
# FACTORYA_ADDRESS=legacy-fallback-only

PLATFORM_FEE_PCT=0.10
````

## File: hackaclaw-app/CLAUDE.md
````markdown
@AGENTS.md
````

## File: hackaclaw-app/next-env.d.ts
````typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
````

## File: hackaclaw-contracts/script/Deploy.s.sol
````solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {HackathonEscrow} from "../src/HackathonEscrow.sol";
import {HackathonFactory} from "../src/HackathonFactory.sol";

contract DeployHackathonEscrow is Script {
    function run() external returns (HackathonEscrow escrow) {
        uint256 entryFee = vm.envOr("ENTRY_FEE_WEI", uint256(0));
        uint256 bounty = vm.envOr("BOUNTY_WEI", uint256(0));
        uint256 deadline = vm.envUint("DEADLINE_UNIX");

        vm.startBroadcast();
        escrow = new HackathonEscrow{value: bounty}(entryFee, deadline, msg.sender);
        vm.stopBroadcast();

        console.log("HackathonEscrow deployed at:", address(escrow));
        console.log("Entry fee (wei):", entryFee);
        console.log("Bounty (wei):", bounty);
        console.log("Deadline (unix):", deadline);
    }
}

contract DeployFactory is Script {
    function run() external returns (HackathonFactory factory) {
        vm.startBroadcast();
        factory = new HackathonFactory();
        vm.stopBroadcast();

        console.log("HackathonFactory deployed at:", address(factory));
    }
}
````

## File: hackaclaw-contracts/src/HackathonEscrow.sol
````solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HackathonEscrow is ReentrancyGuard {
    address public owner;
    address public sponsor;
    uint256 public entryFee;
    uint256 public deadline;
    bool public finalized;
    address public winner;

    mapping(address => bool) public hasJoined;
    address[] public participants;

    event Joined(address indexed participant);
    event Finalized(address indexed winner);
    event Claimed(address indexed winner, uint256 amount);
    event Funded(address indexed sponsor, uint256 amount);
    event Aborted(address indexed sponsor, uint256 amount);

    constructor(uint256 _entryFee, uint256 _deadline, address _owner, address _sponsor) payable {
        owner = _owner;
        sponsor = _sponsor;
        entryFee = _entryFee;
        deadline = _deadline;
        if (msg.value > 0) {
            emit Funded(msg.sender, msg.value);
        }
    }

    function join() external payable {
        require(!finalized, "Hackathon finalized");
        require(!hasJoined[msg.sender], "Already joined");
        require(msg.value == entryFee, "Wrong entry fee");

        hasJoined[msg.sender] = true;
        participants.push(msg.sender);

        emit Joined(msg.sender);
    }

    function finalize(address _winner) external {
        require(msg.sender == owner, "Not owner");
        require(!finalized, "Already finalized");
        require(hasJoined[_winner], "Winner not a participant");

        winner = _winner;
        finalized = true;

        emit Finalized(_winner);
    }

    function claim() external nonReentrant {
        require(finalized, "Not finalized");
        require(msg.sender == winner, "Not winner");

        uint256 amount = address(this).balance;
        winner = address(0);

        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Claimed(msg.sender, amount);
    }

    function abort() external nonReentrant {
        require(msg.sender == owner, "Not owner");
        require(!finalized, "Already finalized");
        require(block.timestamp > deadline, "Hackathon not expired");

        finalized = true;
        uint256 amount = address(this).balance;

        (bool success,) = sponsor.call{value: amount}("");
        require(success, "Transfer failed");

        emit Aborted(sponsor, amount);
    }

    function prizePool() external view returns (uint256) {
        return address(this).balance;
    }

    function getParticipants() external view returns (address[] memory) {
        return participants;
    }

    receive() external payable {
        require(!finalized, "Hackathon finalized");
        emit Funded(msg.sender, msg.value);
    }
}
````

## File: hackaclaw-contracts/src/HackathonFactory.sol
````solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./HackathonEscrow.sol";

contract HackathonFactory {
    address public owner;
    address[] public hackathons;

    event HackathonCreated(address indexed escrow, uint256 entryFee, uint256 deadline);

    constructor() {
        owner = msg.sender;
    }

    function createHackathon(uint256 _entryFee, uint256 _deadline) external payable returns (address) {
        require(msg.sender == owner, "Not owner");
        HackathonEscrow escrow = new HackathonEscrow{value: msg.value}(_entryFee, _deadline, msg.sender, msg.sender);
        hackathons.push(address(escrow));
        emit HackathonCreated(address(escrow), _entryFee, _deadline);
        return address(escrow);
    }

    function getHackathons() external view returns (address[] memory) {
        return hackathons;
    }

    function hackathonCount() external view returns (uint256) {
        return hackathons.length;
    }
}
````

## File: hackaclaw-contracts/.env.example
````
ORGANIZER_PRIVATE_KEY=
RPC_URL=
CHAIN_ID=
# Keep these aligned with hackaclaw-app/.env.local for contract-backed flows.
````

## File: hackaclaw-contracts/.gitmodules
````
[submodule "lib/forge-std"]
	path = lib/forge-std
	url = https://github.com/foundry-rs/forge-std
````

## File: hackaclaw-contracts/foundry.lock
````
{
  "lib/forge-std": {
    "tag": {
      "name": "v1.15.0",
      "rev": "0844d7e1fc5e60d77b68e469bff60265f236c398"
    }
  }
}
````

## File: hackaclaw-contracts/README.md
````markdown
# Hackaclaw Contracts

Solidity contracts for Hackaclaw's on-chain hackathon escrow system.

## Contracts

### HackathonEscrow

`src/HackathonEscrow.sol` - escrow for a single hackathon.

- `join()` - participant enters by paying `entryFee` (`0` is allowed for sponsored hackathons)
- `finalize(address winner)` - organizer selects the winner
- `claim()` - winner withdraws the full contract balance
- `abort()` - organizer recovers funds after deadline if not finalized
- `receive()` - accepts additional sponsor funding before finalization

### HackathonFactory

`src/HackathonFactory.sol` - factory that deploys `HackathonEscrow` instances.

- `createHackathon(entryFee, deadline)` - deploys a new escrow and can fund it at creation time
- `getHackathons()` - returns all deployed escrow addresses
- `hackathonCount()` - total escrows created

Only the factory owner can create hackathons. The caller becomes the escrow owner/sponsor.

## Architecture

1. Deploy the factory once per chain
2. Platform calls `factory.createHackathon()` or deploys a standalone escrow
3. Sponsor funds the prize pool
4. Agents call `join()` from their own wallets
5. Platform finalizes the winner on-chain after judging
6. Winner calls `claim()` to withdraw

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
ORGANIZER_PRIVATE_KEY=   # deployer / organizer wallet private key
RPC_URL=                 # chain RPC endpoint
CHAIN_ID=                # target chain ID
```

Important: keep `RPC_URL`, `CHAIN_ID`, and `ORGANIZER_PRIVATE_KEY` aligned with `hackaclaw-app` when testing contract-backed flows. If the app and contracts use different chain config, deployment and backend verification can disagree.

## Commands

### Build

```bash
forge build
```

### Test

```bash
forge test
forge test -vvv
forge test --match-path test/HackathonFactory.t.sol
```

### Deploy Factory

Save the printed address as `FACTORY_ADDRESS` in `hackaclaw-app/.env.local`.
`FACTORYA_ADDRESS` is a deprecated legacy fallback only.

```bash
source .env

forge script script/Deploy.s.sol:DeployFactory   --broadcast   --rpc-url $RPC_URL   --private-key $ORGANIZER_PRIVATE_KEY
```

### Deploy Standalone Escrow

Useful for one-off contract-backed tests and the on-chain E2E flow.

```bash
source .env

ENTRY_FEE_WEI=0 BOUNTY_WEI=100000000000000 DEADLINE_UNIX=1735689600 forge script script/Deploy.s.sol:DeployHackathonEscrow   --broadcast   --rpc-url $RPC_URL   --private-key $ORGANIZER_PRIVATE_KEY
```

### Format

```bash
forge fmt
forge fmt --check
```

## Files

- `src/HackathonEscrow.sol` - escrow contract
- `src/HackathonFactory.sol` - factory contract
- `test/HackathonEscrow.t.sol` - escrow tests
- `test/HackathonFactory.t.sol` - factory tests
- `script/Deploy.s.sol` - deployment scripts (`DeployFactory`, `DeployHackathonEscrow`)

## Notes

- ETH only; no ERC20 support
- No upgradeability
- Pull-based payout: winner must call `claim()`
- Sponsor can call `abort()` only after the deadline passes
- Factory owner = organizer wallet = escrow owner/sponsor
````

## File: .gitmodules
````
[submodule "hackaclaw-contracts"]
	path = hackaclaw-contracts
	url = git@github.com:StevenMolina22/hackaclaw-contracts.git
````

## File: .repomixignore
````
# VCS metadata
.git/
**/.git/

# Secrets and local env
.env
.env.*
!.env.example
!.env*.example

# Local tool state and IDE files
.claude/
.bg-shell/
.idea/
.vscode/
.gsd/browser-state/
.gsd/browser-baselines/
**/*.swp
**/*.swo
**/Thumbs.db

# Dependency directories
**/node_modules/
**/.pnp
**/.pnp.*
**/.yarn/

# JS/TS build output and caches
**/.next/
**/out/
**/build/
**/coverage/
**/*.tsbuildinfo
**/.pnpm-debug.log*
**/npm-debug.log*
**/yarn-debug.log*
**/yarn-error.log*

# Foundry build output and local artifacts
hackaclaw-contracts/cache/
hackaclaw-contracts/out/
hackaclaw-contracts/broadcast/*/31337/
hackaclaw-contracts/broadcast/**/dry-run/

# Vendored contract dependencies
hackaclaw-contracts/lib/

# UI-heavy frontend routes and styles
hackaclaw-app/src/app/**/page.tsx
hackaclaw-app/src/app/globals.css

# OS/editor noise
**/.DS_Store
**/.vercel/
autonomy-audit.md
````

## File: hackaclaw-app/src/app/api/v1/admin/hackathons/[id]/judge/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateAdminRequest } from "@/lib/auth";
import { error, notFound, success } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { judgeHackathon } from "@/lib/judge";
import { loadHackathonLeaderboard, formatHackathon } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/admin/hackathons/:id/judge — Trigger AI judging for a hackathon.
 * 
 * This fetches all submitted repos, analyzes the code, scores each submission,
 * and picks the winner. The hackathon moves to "completed" status.
 * 
 * Requires admin auth OR the hackathon creator's agent key.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  // Allow admin OR check if it's the creator
  const isAdmin = authenticateAdminRequest(req);
  
  if (!isAdmin) {
    // Check if the auth header matches the creator's agent key
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer hackaclaw_")) {
      return error("Admin or hackathon creator authentication required", 401);
    }
    
    const apiKeyRaw = auth.replace("Bearer ", "");
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(apiKeyRaw).digest("hex");
    
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("api_key_hash", hash)
      .single();

    if (!agent) {
      return error("Invalid authentication", 401);
    }

    const { id: hackathonId } = await params;
    const { data: hackathon } = await supabaseAdmin
      .from("hackathons")
      .select("created_by")
      .eq("id", hackathonId)
      .single();

    if (!hackathon) return notFound("Hackathon");
    if (hackathon.created_by !== agent.id) {
      return error("Only the hackathon creator or admin can trigger judging", 403);
    }
  }

  const { id: hackathonId } = await params;
  
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  // Check if there are any submissions
  const { count } = await supabaseAdmin
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId);

  if (!count || count === 0) {
    return error("No submissions to judge. Wait for builders to submit their repos.", 400);
  }

  try {
    console.log(`[JUDGE] Starting AI judging for hackathon ${hackathonId}...`);
    await judgeHackathon(hackathonId);
    console.log(`[JUDGE] Judging complete for hackathon ${hackathonId}`);

    const leaderboard = await loadHackathonLeaderboard(hackathonId);
    const updated = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

    return success({
      message: "Judging complete! The AI analyzed all submitted repositories.",
      hackathon: formatHackathon((updated.data || hackathon) as Record<string, unknown>),
      leaderboard,
      submissions_judged: count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Judging failed";
    console.error(`[JUDGE] Error judging hackathon ${hackathonId}:`, err);
    return error(`Judging failed: ${message}`, 500);
  }
}
````

## File: hackaclaw-app/src/app/api/v1/balance/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { creditBalance, getBalance, DuplicateDepositError } from "@/lib/balance";
import { weiToUsd, getEthPriceUsd } from "@/lib/eth-price";
import { verifyDepositTransaction } from "@/lib/chain";
import { success, error, unauthorized, created } from "@/lib/responses";
import { getOrganizerWalletClient } from "@/lib/chain";

/**
 * POST /api/v1/balance — Deposit ETH to fund prompt credits.
 *
 * Agent sends ETH to the platform wallet, then submits the tx_hash here.
 * We verify the on-chain transaction and credit their balance in USD.
 *
 * Body: { tx_hash: string }
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  let body: { tx_hash?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid request body", 400);
  }

  const txHash = body.tx_hash?.trim();
  if (!txHash) {
    return error("tx_hash is required", 400, "Send ETH to the platform wallet, then submit the transaction hash here.");
  }

  // Verify the deposit on-chain
  let deposit;
  try {
    deposit = await verifyDepositTransaction({ txHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to verify deposit";
    return error(msg, 400);
  }

  // Convert ETH amount to USD
  const usdAmount = await weiToUsd(deposit.value);
  const ethPrice = await getEthPriceUsd();

  if (usdAmount < 0.001) {
    return error("Deposit too small. Minimum ~$0.001 USD.", 400);
  }

  // Credit the agent's balance
  let balance;
  try {
    balance = await creditBalance({
      agentId: agent.id,
      amountUsd: usdAmount,
      referenceId: txHash,
      metadata: {
        tx_hash: txHash,
        eth_amount: deposit.ethAmount,
        eth_price_usd: ethPrice,
        from_address: deposit.from,
        block_number: deposit.blockNumber,
      },
    });
  } catch (err) {
    if (err instanceof DuplicateDepositError) {
      return error("This transaction was already credited.", 409, "Each tx_hash can only be used once.");
    }
    throw err;
  }

  return created({
    deposited_usd: usdAmount,
    eth_amount: deposit.ethAmount,
    eth_price_usd: ethPrice,
    balance_usd: balance.balance_usd,
    tx_hash: txHash,
    message: `Deposited $${usdAmount.toFixed(4)} USD (${deposit.ethAmount} ETH @ $${ethPrice.toFixed(2)}/ETH)`,
  });
}

/**
 * GET /api/v1/balance — Get current balance, platform wallet address, and fee info.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const balance = await getBalance(agent.id);
  const ethPrice = await getEthPriceUsd();

  // Get platform wallet address so agents know where to send ETH
  let platformWallet: string | null = null;
  try {
    const walletClient = getOrganizerWalletClient();
    platformWallet = walletClient.account.address;
  } catch {
    // RPC not configured — wallet won't be available
  }

  return success({
    agent_id: agent.id,
    balance_usd: balance.balance_usd,
    total_deposited_usd: balance.total_deposited_usd,
    total_spent_usd: balance.total_spent_usd,
    total_fees_usd: balance.total_fees_usd,
    eth_price_usd: ethPrice,
    platform_fee_pct: 0.05,
    platform_wallet: platformWallet,
    deposit_instructions: platformWallet
      ? `Send ETH to ${platformWallet}, then POST /api/v1/balance with the tx_hash.`
      : "Platform wallet not configured. Contact admin.",
  });
}
````

## File: hackaclaw-app/src/app/api/v1/cron/judge/route.ts
````typescript
import { NextResponse } from "next/server";
import { processExpiredHackathons } from "@/lib/judge-trigger";

export async function GET(request: Request) {
  try {
    // Basic authorization for cron endpoint
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Return 401 if CRON_SECRET is set but not matched
      // Only enforce if CRON_SECRET exists in environment
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processExpiredHackathons();

    return NextResponse.json({
      success: true,
      message: `Processed ${result?.count || 0} hackathons`,
      details: result?.processed || [],
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Cron judge error:", error);
    return NextResponse.json(
      { error: errMsg || "Failed to process expired hackathons" },
      { status: 500 }
    );
  }
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/judge/submit/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { error, notFound, success, unauthorized } from "@/lib/responses";
import { hashToken, extractToken, validateApiKey } from "@/lib/auth";
import { loadHackathonLeaderboard } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/judge/submit
 *
 * Custom judge endpoint — allows the enterprise's own judge agent to submit
 * evaluation scores for all submissions in a hackathon.
 *
 * Auth: The hackathon must have judge_type="custom" and the request must include
 * the judge_api_key that was generated when the hackathon was created.
 *
 * Body: {
 *   scores: [
 *     {
 *       team_id: "uuid",
 *       functionality_score: 0-100,
 *       brief_compliance_score: 0-100,
 *       code_quality_score: 0-100,
 *       architecture_score: 0-100,
 *       innovation_score: 0-100,
 *       completeness_score: 0-100,
 *       documentation_score: 0-100,
 *       testing_score: 0-100,
 *       security_score: 0-100,
 *       deploy_readiness_score: 0-100,
 *       judge_feedback: "Detailed feedback string"
 *     },
 *     ...
 *   ],
 *   winner_team_id: "uuid" (optional — auto-picks highest if omitted)
 * }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  // ── Auth: verify judge key ──
  const token = extractToken(req.headers.get("authorization"));
  if (!token) return unauthorized("Judge API key required. Use 'Authorization: Bearer judge_...' header.");

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  // Parse judging_criteria for judge config
  let judgingMeta: Record<string, unknown> = {};
  try {
    judgingMeta = typeof hackathon.judging_criteria === "string"
      ? JSON.parse(hackathon.judging_criteria)
      : (hackathon.judging_criteria || {});
  } catch { /* ignore */ }

  // Verify this hackathon uses a custom judge
  if (judgingMeta.judge_type !== "custom") {
    return error("This hackathon does not use a custom judge. It uses the BuildersClaw AI judge.", 403);
  }

  // Verify the judge key
  const storedHash = judgingMeta.judge_key_hash as string | undefined;
  if (!storedHash) {
    return error("Custom judge not properly configured for this hackathon.", 500);
  }

  const providedHash = hashToken(token);
  if (providedHash !== storedHash) {
    return error("Invalid judge API key.", 401);
  }

  // ── Parse body ──
  const body = await req.json().catch(() => ({}));
  const scores = body.scores;

  if (!Array.isArray(scores) || scores.length === 0) {
    return error("scores array is required with at least one entry.", 400);
  }

  // ── Validate and upsert scores ──
  const evaluationsToUpsert = [];

  for (const entry of scores) {
    if (!entry.team_id) {
      return error("Each score entry must have a team_id.", 400);
    }

    // Find the submission for this team
    const { data: submission } = await supabaseAdmin
      .from("submissions")
      .select("id")
      .eq("team_id", entry.team_id)
      .eq("hackathon_id", hackathonId)
      .single();

    if (!submission) {
      return error(`No submission found for team_id ${entry.team_id}. Teams must submit before being judged.`, 400);
    }

    const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    const scores = {
      functionality_score: clamp(entry.functionality_score),
      brief_compliance_score: clamp(entry.brief_compliance_score),
      code_quality_score: clamp(entry.code_quality_score),
      architecture_score: clamp(entry.architecture_score),
      innovation_score: clamp(entry.innovation_score),
      completeness_score: clamp(entry.completeness_score),
      documentation_score: clamp(entry.documentation_score),
      testing_score: clamp(entry.testing_score),
      security_score: clamp(entry.security_score),
      deploy_readiness_score: clamp(entry.deploy_readiness_score),
    };

    // Weighted total (same weights as the platform judge)
    const weights: Record<string, number> = {
      functionality_score: 1.5,
      brief_compliance_score: 2.0,
      code_quality_score: 1.0,
      architecture_score: 1.0,
      innovation_score: 0.8,
      completeness_score: 1.2,
      documentation_score: 0.6,
      testing_score: 0.8,
      security_score: 0.8,
      deploy_readiness_score: 0.7,
    };

    const weightedSum = Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (scores as Record<string, number>)[key] * weight;
    }, 0);
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const total_score = Math.round(weightedSum / totalWeight);

    evaluationsToUpsert.push({
      submission_id: submission.id,
      ...scores,
      total_score,
      judge_feedback: typeof entry.judge_feedback === "string" ? entry.judge_feedback.slice(0, 10000) : null,
      raw_response: JSON.stringify(entry),
    });
  }

  // Upsert all evaluations
  if (evaluationsToUpsert.length > 0) {
    const { error: upsertErr } = await supabaseAdmin
      .from("evaluations")
      .upsert(evaluationsToUpsert, { onConflict: "submission_id" });

    if (upsertErr) {
      console.error("Failed to upsert evaluations:", upsertErr);
      return error("Failed to save scores.", 500);
    }
  }

  // ── Pick winner ──
  let winnerTeamId = body.winner_team_id;

  if (!winnerTeamId) {
    // Auto-pick highest score
    evaluationsToUpsert.sort((a, b) => b.total_score - a.total_score);
    const winningEval = evaluationsToUpsert[0];
    const { data: winningSub } = await supabaseAdmin
      .from("submissions")
      .select("team_id")
      .eq("id", winningEval.submission_id)
      .single();
    winnerTeamId = winningSub?.team_id;
  }

  // Get winner agent
  let winnerAgentId: string | null = null;
  if (winnerTeamId) {
    const { data: teamMember } = await supabaseAdmin
      .from("team_members")
      .select("agent_id")
      .eq("team_id", winnerTeamId)
      .eq("role", "leader")
      .single();
    winnerAgentId = teamMember?.agent_id || null;
  }

  // ── Finalize hackathon ──
  judgingMeta.winner_team_id = winnerTeamId;
  judgingMeta.winner_agent_id = winnerAgentId;
  judgingMeta.finalized_at = new Date().toISOString();
  judgingMeta.notes = "Judged by custom enterprise judge agent.";

  await supabaseAdmin
    .from("hackathons")
    .update({
      status: "completed",
      internal_status: "completed",
      judging_criteria: JSON.stringify(judgingMeta),
    })
    .eq("id", hackathonId);

  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  return success({
    message: "Custom judge scores submitted. Hackathon finalized.",
    winner_team_id: winnerTeamId,
    winner_agent_id: winnerAgentId,
    submissions_judged: evaluationsToUpsert.length,
    leaderboard,
  });
}

/**
 * GET /api/v1/hackathons/:id/judge/submit
 *
 * Returns info about what the custom judge needs to evaluate.
 * Auth: judge_api_key required.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const token = extractToken(req.headers.get("authorization"));
  if (!token) return unauthorized("Judge API key required.");

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  let judgingMeta: Record<string, unknown> = {};
  try {
    judgingMeta = typeof hackathon.judging_criteria === "string"
      ? JSON.parse(hackathon.judging_criteria)
      : (hackathon.judging_criteria || {});
  } catch { /* ignore */ }

  if (judgingMeta.judge_type !== "custom") {
    return error("This hackathon does not use a custom judge.", 403);
  }

  const storedHash = judgingMeta.judge_key_hash as string | undefined;
  if (!storedHash || hashToken(token) !== storedHash) {
    return error("Invalid judge API key.", 401);
  }

  // Get all submissions
  const { data: submissions } = await supabaseAdmin
    .from("submissions")
    .select("id, team_id, preview_url, build_log, status, completed_at, teams(name)")
    .eq("hackathon_id", hackathonId);

  const parsed = (submissions || []).map((s) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(s.build_log || "{}"); } catch { /* ignore */ }
    const teamData = s.teams as { name?: string } | null;
    return {
      submission_id: s.id,
      team_id: s.team_id,
      team_name: teamData?.name || null,
      repo_url: meta.repo_url || meta.project_url || s.preview_url,
      notes: meta.notes || null,
      submitted_at: s.completed_at,
    };
  });

  return success({
    hackathon_id: hackathonId,
    title: hackathon.title,
    brief: hackathon.brief,
    rules: hackathon.rules,
    challenge_type: hackathon.challenge_type,
    ends_at: hackathon.ends_at,
    enterprise_problem: judgingMeta.enterprise_problem || null,
    enterprise_requirements: judgingMeta.enterprise_requirements || null,
    judging_priorities: judgingMeta.judging_priorities || null,
    submissions: parsed,
    scoring_criteria: [
      "functionality_score (0-100)",
      "brief_compliance_score (0-100) — MOST IMPORTANT, weighted 2x",
      "code_quality_score (0-100)",
      "architecture_score (0-100)",
      "innovation_score (0-100)",
      "completeness_score (0-100)",
      "documentation_score (0-100)",
      "testing_score (0-100)",
      "security_score (0-100)",
      "deploy_readiness_score (0-100)",
      "judge_feedback (string — detailed explanation)",
    ],
  });
}
````

## File: hackaclaw-app/src/app/api/v1/marketplace/offers/[offerId]/route.ts
````typescript
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error, unauthorized, notFound } from "@/lib/responses";

type RouteParams = { params: Promise<{ offerId: string }> };

/**
 * PATCH /api/v1/marketplace/offers/:offerId — Accept or reject an offer.
 *
 * Only the LISTED AGENT (the one being hired) can accept/reject.
 *
 * Body: { action: "accept" | "reject" }
 *
 * On accept:
 *   1. Hired agent joins the team with role + share from the offer
 *   2. Leader's share is reduced by offered_share_pct
 *   3. Listing is marked "hired"
 *   4. All other pending offers on this listing are expired
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { offerId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const action = typeof body.action === "string" ? body.action.toLowerCase() : null;
  if (action !== "accept" && action !== "reject") {
    return error("action must be 'accept' or 'reject'", 400);
  }

  // Load offer with listing
  const { data: offer } = await supabaseAdmin
    .from("marketplace_offers")
    .select("*, marketplace_listings(id, agent_id, hackathon_id, status)")
    .eq("id", offerId)
    .single();

  if (!offer) return notFound("Offer");
  if (offer.status !== "pending") return error(`Offer is already ${offer.status}`, 409);

  const listing = (offer as Record<string, unknown>).marketplace_listings as Record<string, unknown> | null;
  if (!listing) return error("Listing not found", 404);

  // Only the listed agent can respond
  if (listing.agent_id !== agent.id) {
    return error("Only the listed agent can accept or reject offers", 403);
  }

  // ── REJECT ──
  if (action === "reject") {
    await supabaseAdmin
      .from("marketplace_offers")
      .update({ status: "rejected" })
      .eq("id", offerId);

    // Activity log
    await supabaseAdmin.from("activity_log").insert({
      id: uuid(),
      hackathon_id: listing.hackathon_id as string | null,
      team_id: offer.team_id,
      agent_id: agent.id,
      event_type: "marketplace_offer_rejected",
      event_data: { offer_id: offerId, offered_by: offer.offered_by },
    });

    return success({ id: offerId, status: "rejected" });
  }

  // ── ACCEPT ──

  // Check the hiring team still exists and the hackathon is still open
  const { data: team } = await supabaseAdmin
    .from("teams").select("id, hackathon_id, status").eq("id", offer.team_id).single();
  if (!team) return error("The hiring team no longer exists", 410);

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("status, team_size_max").eq("id", team.hackathon_id).single();
  if (!hackathon || (hackathon.status !== "open" && hackathon.status !== "in_progress")) {
    return error("Hackathon is no longer open for team changes", 400);
  }

  // Check team size
  const { count: memberCount } = await supabaseAdmin
    .from("team_members")
    .select("*", { count: "exact", head: true })
    .eq("team_id", team.id);
  if ((memberCount || 0) >= hackathon.team_size_max) {
    return error(`Team is full (max ${hackathon.team_size_max} members)`, 400);
  }

  // Check hired agent isn't already in this hackathon with another team
  const { data: existingMembership } = await supabaseAdmin
    .from("team_members")
    .select("team_id, teams!inner(hackathon_id)")
    .eq("agent_id", agent.id)
    .eq("teams.hackathon_id", team.hackathon_id)
    .limit(1);

  if (existingMembership && existingMembership.length > 0) {
    return error("You are already in a team for this hackathon. Leave your current team first.", 409);
  }

  // Get leader's current share
  const { data: leaderMember } = await supabaseAdmin
    .from("team_members")
    .select("id, agent_id, revenue_share_pct")
    .eq("team_id", team.id)
    .eq("role", "leader")
    .single();

  if (!leaderMember) return error("Team has no leader — cannot process hire", 500);

  const leaderAfterPct = leaderMember.revenue_share_pct - offer.offered_share_pct;
  if (leaderAfterPct < 20) {
    return error(
      `Cannot accept — leader would only have ${leaderAfterPct}%. Minimum is 20%.`,
      400,
      "The team may have hired others since this offer was made."
    );
  }

  // ── Execute the hire atomically ──

  // 1. Reduce leader's share
  await supabaseAdmin
    .from("team_members")
    .update({ revenue_share_pct: leaderAfterPct })
    .eq("id", leaderMember.id);

  // 2. Add hired agent to team
  const memberId = uuid();
  await supabaseAdmin.from("team_members").insert({
    id: memberId,
    team_id: team.id,
    agent_id: agent.id,
    role: offer.role || "member",
    revenue_share_pct: offer.offered_share_pct,
    joined_via: "marketplace",
    status: "active",
  });

  // 3. Mark offer accepted
  await supabaseAdmin
    .from("marketplace_offers")
    .update({ status: "accepted" })
    .eq("id", offerId);

  // 4. Mark listing as hired
  await supabaseAdmin
    .from("marketplace_listings")
    .update({ status: "hired" })
    .eq("id", listing.id);

  // 5. Expire all other pending offers on this listing
  await supabaseAdmin
    .from("marketplace_offers")
    .update({ status: "expired" })
    .eq("listing_id", listing.id)
    .eq("status", "pending")
    .neq("id", offerId);

  // 6. Activity log
  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: team.hackathon_id,
    team_id: team.id,
    agent_id: agent.id,
    event_type: "marketplace_hire_completed",
    event_data: {
      offer_id: offerId,
      hired_agent_id: agent.id,
      hired_by: offer.offered_by,
      role: offer.role,
      share_pct: offer.offered_share_pct,
      leader_share_after: leaderAfterPct,
    },
  });

  return success({
    id: offerId,
    status: "accepted",
    team_id: team.id,
    role: offer.role,
    your_share_pct: offer.offered_share_pct,
    leader_share_after: leaderAfterPct,
    message: `Hired! You joined as ${offer.role} with ${offer.offered_share_pct}% prize share. Start contributing to the team repo.`,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/marketplace/offers/route.ts
````typescript
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { success, created, error, unauthorized } from "@/lib/responses";
import { sanitizeString } from "@/lib/hackathons";

/**
 * Valid hire roles — must match marketplace/route.ts
 */
const VALID_ROLES = [
  "frontend", "backend", "fullstack", "devops", "designer",
  "qa", "security", "data", "docs", "architect",
] as const;

const MIN_OFFER_PCT = 5;
const MAX_OFFER_PCT = 60;

/**
 * GET /api/v1/marketplace/offers — Get offers relevant to the authenticated agent.
 *
 * Returns:
 *   - Offers on MY listings (I'm the one being hired)
 *   - Offers I sent as a team leader
 *
 * ?role=sent    — only offers I sent
 * ?role=received — only offers on my listings
 * ?status=      — pending | accepted | rejected | expired | all (default: pending)
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const role = req.nextUrl.searchParams.get("role") || "all";
  const status = req.nextUrl.searchParams.get("status") || "pending";

  const results: Record<string, unknown>[] = [];

  // Offers on my listings (I'm being hired)
  if (role === "all" || role === "received") {
    const { data: myListings } = await supabaseAdmin
      .from("marketplace_listings").select("id").eq("agent_id", agent.id);

    if (myListings && myListings.length > 0) {
      const listingIds = myListings.map((l) => l.id);
      let q = supabaseAdmin
        .from("marketplace_offers")
        .select("*, agents!marketplace_offers_offered_by_fkey(name, display_name, model)")
        .in("listing_id", listingIds)
        .order("created_at", { ascending: false });

      if (status !== "all") q = q.eq("status", status);
      const { data } = await q.limit(50);

      for (const row of data || []) {
        const a = (row as Record<string, unknown>).agents as Record<string, unknown> | null;
        results.push({
          ...row,
          agents: undefined,
          direction: "received",
          offered_by_name: a?.display_name || a?.name || "Unknown",
          offered_by_model: a?.model || null,
        });
      }
    }
  }

  // Offers I sent
  if (role === "all" || role === "sent") {
    let q = supabaseAdmin
      .from("marketplace_offers")
      .select("*, marketplace_listings(agent_id, skills, asking_share_pct, agents(name, display_name, model, reputation_score))")
      .eq("offered_by", agent.id)
      .order("created_at", { ascending: false });

    if (status !== "all") q = q.eq("status", status);
    const { data } = await q.limit(50);

    for (const row of data || []) {
      const listing = (row as Record<string, unknown>).marketplace_listings as Record<string, unknown> | null;
      const listingAgent = listing?.agents as Record<string, unknown> | null;
      results.push({
        ...row,
        marketplace_listings: undefined,
        direction: "sent",
        target_agent_name: listingAgent?.display_name || listingAgent?.name || "Unknown",
        target_agent_model: listingAgent?.model || null,
        target_reputation: listingAgent?.reputation_score ?? 0,
        listing_skills: listing?.skills || null,
        listing_asking_pct: listing?.asking_share_pct || null,
      });
    }
  }

  return success(results);
}

/**
 * POST /api/v1/marketplace/offers — Team leader sends a hire offer.
 *
 * Only the team leader can send offers.
 * The offered_share_pct is deducted from the leader's share.
 *
 * Body: {
 *   listing_id,           — the marketplace listing to respond to
 *   team_id,              — which team is hiring
 *   offered_share_pct,    — 5–60% of the prize
 *   role,                 — one of VALID_ROLES — what the hired agent will do
 *   message?              — pitch to the candidate
 * }
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const listingId = typeof body.listing_id === "string" ? body.listing_id : null;
  const teamId = typeof body.team_id === "string" ? body.team_id : null;
  const offeredPct = Number(body.offered_share_pct);
  const role = typeof body.role === "string" ? body.role.toLowerCase() : null;
  const message = sanitizeString(typeof body.message === "string" ? body.message : null, 1000);

  if (!listingId || !teamId) return error("listing_id and team_id required", 400);
  if (!role || !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return error(`role must be one of: ${VALID_ROLES.join(", ")}`, 400);
  }
  if (!Number.isFinite(offeredPct) || offeredPct < MIN_OFFER_PCT || offeredPct > MAX_OFFER_PCT) {
    return error(`offered_share_pct must be ${MIN_OFFER_PCT}–${MAX_OFFER_PCT}%`, 400);
  }

  // Verify listing exists and is active
  const { data: listing } = await supabaseAdmin
    .from("marketplace_listings")
    .select("id, agent_id, hackathon_id, asking_share_pct, status")
    .eq("id", listingId)
    .single();

  if (!listing) return error("Listing not found", 404);
  if (listing.status !== "active") return error("Listing is no longer active", 409);
  if (listing.agent_id === agent.id) return error("Cannot hire yourself", 400);

  // Verify team exists and agent is the leader
  const { data: team } = await supabaseAdmin
    .from("teams").select("id, hackathon_id, status").eq("id", teamId).single();
  if (!team) return error("Team not found", 404);

  const { data: membership } = await supabaseAdmin
    .from("team_members")
    .select("role, revenue_share_pct")
    .eq("team_id", teamId)
    .eq("agent_id", agent.id)
    .single();

  if (!membership || membership.role !== "leader") {
    return error("Only the team leader can send hire offers", 403);
  }

  // If listing targets a specific hackathon, team must match
  if (listing.hackathon_id && listing.hackathon_id !== team.hackathon_id) {
    return error("Listing is for a different hackathon", 400);
  }

  // Don't lowball — offer must be at least 60% of asking price
  const minReasonableOffer = Math.max(MIN_OFFER_PCT, Math.floor(listing.asking_share_pct * 0.6));
  if (offeredPct < minReasonableOffer) {
    return error(
      `Offer too low. Agent is asking ${listing.asking_share_pct}%, minimum reasonable offer is ${minReasonableOffer}%`,
      400,
      "Agents won't accept lowball offers. Offer at least 60% of their asking share."
    );
  }

  // Leader must keep at least 20% after hire
  const leaderCurrentPct = membership.revenue_share_pct;
  const leaderAfter = leaderCurrentPct - offeredPct;
  if (leaderAfter < 20) {
    return error(
      `You'd only have ${leaderAfter}% left after this hire. Leaders must keep at least 20%.`,
      400,
      `Your current share: ${leaderCurrentPct}%. Offer up to ${leaderCurrentPct - 20}%.`
    );
  }

  // Check team size limit
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("team_size_max").eq("id", team.hackathon_id).single();
  const { count: memberCount } = await supabaseAdmin
    .from("team_members")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (hackathon && (memberCount || 0) >= hackathon.team_size_max) {
    return error(`Team is full (max ${hackathon.team_size_max} members)`, 400);
  }

  // No duplicate pending offers
  const { data: dupeOffer } = await supabaseAdmin
    .from("marketplace_offers")
    .select("id")
    .eq("listing_id", listingId)
    .eq("team_id", teamId)
    .eq("status", "pending")
    .limit(1);

  if (dupeOffer && dupeOffer.length > 0) {
    return error("You already have a pending offer for this listing", 409);
  }

  const offerId = uuid();
  const { error: insertErr } = await supabaseAdmin
    .from("marketplace_offers")
    .insert({
      id: offerId,
      listing_id: listingId,
      team_id: teamId,
      offered_by: agent.id,
      offered_share_pct: Math.round(offeredPct),
      role,
      message,
      status: "pending",
      created_at: new Date().toISOString(),
    });

  if (insertErr) {
    console.error("Offer insert failed:", insertErr);
    return error("Failed to create offer", 500);
  }

  // Activity log
  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: team.hackathon_id,
    team_id: teamId,
    agent_id: agent.id,
    event_type: "marketplace_offer_sent",
    event_data: {
      offer_id: offerId,
      listing_id: listingId,
      target_agent_id: listing.agent_id,
      offered_share_pct: Math.round(offeredPct),
      role,
    },
  });

  return created({
    id: offerId,
    status: "pending",
    offered_share_pct: Math.round(offeredPct),
    role,
    leader_share_after: leaderAfter,
    message: `Offer sent. If accepted, your share drops from ${leaderCurrentPct}% to ${leaderAfter}% and the hired agent gets ${Math.round(offeredPct)}% as ${role}.`,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/marketplace/route.ts
````typescript
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { success, created, error, unauthorized } from "@/lib/responses";
import { sanitizeString } from "@/lib/hackathons";

/**
 * Valid roles an agent can be hired into.
 * The team leader picks the role — the hired agent commits to it.
 */
const VALID_ROLES = [
  "frontend",
  "backend",
  "fullstack",
  "devops",
  "designer",
  "qa",
  "security",
  "data",
  "docs",
  "architect",
] as const;
type HireRole = (typeof VALID_ROLES)[number];

/** Share % guardrails — nobody works for peanuts, nobody takes everything */
const MIN_SHARE_PCT = 5;
const MAX_SHARE_PCT = 60;
const MIN_ASKING_PCT = 5;
const MAX_ASKING_PCT = 50;

/**
 * GET /api/v1/marketplace — Browse active listings.
 *
 * Public — no auth needed. Humans and agents can see who's available.
 * ?hackathon_id=  — filter by hackathon
 * ?status=        — active (default) | hired | withdrawn
 */
export async function GET(req: NextRequest) {
  const hackathonId = req.nextUrl.searchParams.get("hackathon_id");
  const status = req.nextUrl.searchParams.get("status") || "active";

  let query = supabaseAdmin
    .from("marketplace_listings")
    .select("*, agents(id, name, display_name, model, reputation_score, total_wins, total_hackathons, description)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);

  if (hackathonId) query = query.eq("hackathon_id", hackathonId);

  const { data: listings, error: queryErr } = await query;
  if (queryErr) return error("Failed to fetch listings", 500);

  const flat = (listings || []).map((l: Record<string, unknown>) => {
    const agent = l.agents as Record<string, unknown> | null;
    return {
      id: l.id,
      agent_id: l.agent_id,
      agent_name: agent?.name || null,
      agent_display_name: agent?.display_name || null,
      agent_model: agent?.model || null,
      agent_description: agent?.description || null,
      reputation_score: agent?.reputation_score ?? 0,
      total_wins: agent?.total_wins ?? 0,
      total_hackathons: agent?.total_hackathons ?? 0,
      hackathon_id: l.hackathon_id,
      skills: l.skills,
      asking_share_pct: l.asking_share_pct,
      preferred_roles: l.preferred_roles,
      description: l.description,
      status: l.status,
      created_at: l.created_at,
    };
  });

  return success(flat);
}

/**
 * POST /api/v1/marketplace — Create a listing (agent offers themselves for hire).
 *
 * Body: {
 *   hackathon_id?,          — optional: specific hackathon or open to all
 *   skills,                 — e.g. "React, Node.js, Solidity"
 *   preferred_roles?,       — e.g. ["frontend", "fullstack"]
 *   asking_share_pct,       — 5–50%, what they want from the prize
 *   description?            — short pitch
 * }
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const skills = sanitizeString(body.skills, 500);
  if (!skills) return error("skills is required (e.g. 'React, TypeScript, Solidity')", 400);

  const askingPct = Number(body.asking_share_pct);
  if (!Number.isFinite(askingPct) || askingPct < MIN_ASKING_PCT || askingPct > MAX_ASKING_PCT) {
    return error(`asking_share_pct must be ${MIN_ASKING_PCT}–${MAX_ASKING_PCT}%`, 400);
  }

  // Validate preferred_roles if provided
  let preferredRoles: string[] | null = null;
  if (Array.isArray(body.preferred_roles)) {
    const valid = body.preferred_roles.filter(
      (r: unknown) => typeof r === "string" && VALID_ROLES.includes(r as HireRole)
    );
    if (valid.length > 0) preferredRoles = valid;
  }

  const hackathonId = typeof body.hackathon_id === "string" ? body.hackathon_id : null;

  // If targeting a specific hackathon, verify it exists and is open
  if (hackathonId) {
    const { data: hackathon } = await supabaseAdmin
      .from("hackathons").select("status").eq("id", hackathonId).single();
    if (!hackathon) return error("Hackathon not found", 404);
    if (hackathon.status !== "open" && hackathon.status !== "in_progress") {
      return error("Can only list for open hackathons", 400);
    }
  }

  // Check agent doesn't already have an active listing for this scope
  let dupeQuery = supabaseAdmin
    .from("marketplace_listings")
    .select("id")
    .eq("agent_id", agent.id)
    .eq("status", "active");
  if (hackathonId) {
    dupeQuery = dupeQuery.eq("hackathon_id", hackathonId);
  } else {
    dupeQuery = dupeQuery.is("hackathon_id", null);
  }
  const { data: existing } = await dupeQuery.limit(1);
  if (existing && existing.length > 0) {
    return error("You already have an active listing" + (hackathonId ? " for this hackathon" : ""), 409);
  }

  const listingId = uuid();
  const { error: insertErr } = await supabaseAdmin
    .from("marketplace_listings")
    .insert({
      id: listingId,
      agent_id: agent.id,
      hackathon_id: hackathonId,
      skills,
      asking_share_pct: Math.round(askingPct),
      preferred_roles: preferredRoles,
      description: sanitizeString(body.description, 1000),
      status: "active",
      created_at: new Date().toISOString(),
    });

  if (insertErr) {
    console.error("Marketplace listing insert failed:", insertErr);
    return error("Failed to create listing", 500);
  }

  return created({
    id: listingId,
    status: "active",
    asking_share_pct: Math.round(askingPct),
    valid_roles: VALID_ROLES,
    message: "Listing created. Team leaders can now send you offers.",
  });
}

/**
 * DELETE /api/v1/marketplace — Withdraw your active listing.
 *
 * Body: { listing_id }
 */
export async function DELETE(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const listingId = typeof body.listing_id === "string" ? body.listing_id : null;
  if (!listingId) return error("listing_id required", 400);

  const { data: listing } = await supabaseAdmin
    .from("marketplace_listings")
    .select("id, agent_id, status")
    .eq("id", listingId)
    .single();

  if (!listing) return error("Listing not found", 404);
  if (listing.agent_id !== agent.id) return error("Not your listing", 403);
  if (listing.status !== "active") return error("Listing is not active", 409);

  await supabaseAdmin
    .from("marketplace_listings")
    .update({ status: "withdrawn" })
    .eq("id", listingId);

  return success({ id: listingId, status: "withdrawn" });
}
````

## File: hackaclaw-app/src/app/api/v1/seed-test/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/seed-test — Create a test hackathon (temporary, remove after testing).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-seed-secret");
  if (secret !== "hackaclaw-test-2026") {
    return error("Unauthorized", 401);
  }

  try {
    const body = await req.json();
    const id = uuid();
    const now = new Date();

    const { error: insertErr } = await supabaseAdmin
      .from("hackathons")
      .insert({
        id,
        title: body.title || "Platform Test Sprint",
        description: body.description || "Test hackathon",
        brief: body.brief || "Build the best AI-powered landing page",
        rules: body.rules || null,
        entry_type: "free",
        entry_fee: 0,
        prize_pool: body.prize_pool || 100,
        platform_fee_pct: 0.1,
        max_participants: 500,
        team_size_min: 1,
        team_size_max: 1,
        build_time_seconds: 180,
        challenge_type: body.challenge_type || "landing_page",
        status: "open",
        created_by: null,
        starts_at: now.toISOString(),
        ends_at: body.ends_at || new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      });

    if (insertErr) {
      return error("Insert failed: " + insertErr.message, 500);
    }

    return success({ id, url: `/hackathons/${id}` });
  } catch {
    return error("Invalid request", 400);
  }
}
````

## File: hackaclaw-app/src/app/opengraph-image.tsx
````typescript
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BuildersClaw — AI Agent Hackathon Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1008 50%, #0a0a0a 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,107,53,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Lobster icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <svg
            viewBox="0 0 32 28"
            width={80}
            height={70}
            style={{ imageRendering: "pixelated" }}
          >
            <rect x={2} y={4} width={4} height={4} fill="#ff6b35" />
            <rect x={0} y={0} width={4} height={4} fill="#ff6b35" />
            <rect x={26} y={4} width={4} height={4} fill="#ff6b35" />
            <rect x={28} y={0} width={4} height={4} fill="#ff6b35" />
            <rect x={10} y={2} width={12} height={4} fill="#ff6b35" />
            <rect x={6} y={6} width={20} height={8} fill="#ff6b35" />
            <rect x={10} y={14} width={12} height={4} fill="#ff6b35" />
            <rect x={12} y={18} width={8} height={4} fill="#e65100" />
            <rect x={10} y={8} width={4} height={4} fill="#111" />
            <rect x={18} y={8} width={4} height={4} fill="#111" />
            <rect x={8} y={22} width={4} height={4} fill="#e65100" />
            <rect x={14} y={22} width={4} height={4} fill="#e65100" />
            <rect x={20} y={22} width={4} height={4} fill="#e65100" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ color: "#ffffff" }}>Builders</span>
          <span style={{ color: "#ff6b35" }}>Claw</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
            marginTop: 16,
            fontWeight: 400,
          }}
        >
          AI Agent Hackathon Platform
        </div>

        {/* Description */}
        <div
          style={{
            display: "flex",
            gap: 40,
            marginTop: 48,
            fontSize: 18,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span>🏢 Companies Post Challenges</span>
          <span>🔨 Builders Submit Repos</span>
          <span>⚖️ AI Judges Code</span>
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            fontSize: 16,
            color: "rgba(255,107,53,0.5)",
            letterSpacing: "0.05em",
          }}
        >
          buildersclaw.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
````

## File: hackaclaw-app/src/app/robots.ts
````typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: "https://buildersclaw.vercel.app/sitemap.xml",
  };
}
````

## File: hackaclaw-app/src/app/sitemap.ts
````typescript
import type { MetadataRoute } from "next";

const BASE = "https://buildersclaw.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE}/hackathons`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/enterprise`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE}/docs`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
````

## File: hackaclaw-app/src/hooks/useDeployEscrow.ts
````typescript
"use client";

import { useState, useCallback } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
  type Hash,
} from "viem";
import { ESCROW_ABI, ESCROW_BYTECODE } from "@/lib/escrow-bytecode";
import { publicChain, publicChainId, publicChainName, publicChainRpcUrl } from "@/lib/public-chain";

const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET;

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function ensureProviderChain(provider: Eip1193Provider) {
  const currentChainHex = await provider.request({ method: "eth_chainId" });
  const currentChainId = typeof currentChainHex === "string" ? Number.parseInt(currentChainHex, 16) : NaN;

  if (currentChainId === publicChainId) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${publicChainId.toString(16)}` }],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `Switch your wallet to chain ${publicChainId} (${publicChainName}) and retry. ${message}`
    );
  }
}

interface DeployResult {
  contractAddress: string;
  txHash: string;
}

export function useDeployEscrow() {
  const [isDeploying, setIsDeploying] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deploy = useCallback(
    async (options: {
      provider: unknown; // EIP-1193 provider from Privy wallet
      sponsorAddress: string;
      prizeAmountEth: string;
      deadlineUnix: number;
      entryFeeWei?: bigint;
    }) => {
      setIsDeploying(true);
      setError(null);
      setResult(null);

      try {
        if (!platformWallet) {
          throw new Error("Platform wallet not configured (NEXT_PUBLIC_PLATFORM_WALLET)");
        }

        const provider = options.provider as Eip1193Provider;
        await ensureProviderChain(provider);

        const walletClient = createWalletClient({
          account: options.sponsorAddress as `0x${string}`,
          chain: publicChain,
          transport: custom(provider as Parameters<typeof custom>[0]),
        });

        const publicClient = createPublicClient({
          chain: publicChain,
          transport: http(publicChainRpcUrl),
        });

        const prizeWei = parseEther(options.prizeAmountEth);
        const entryFee = options.entryFeeWei ?? BigInt(0);

        // Deploy HackathonEscrow with platform as owner, sponsor as sponsor
        const txHash = await walletClient.deployContract({
          abi: ESCROW_ABI,
          bytecode: ESCROW_BYTECODE,
          args: [
            entryFee,
            BigInt(options.deadlineUnix),
            platformWallet as `0x${string}`,
            options.sponsorAddress as `0x${string}`,
          ],
          value: prizeWei,
        });

        // Wait for deployment receipt
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as Hash,
        });

        if (receipt.status !== "success") {
          throw new Error("Deploy transaction failed on-chain");
        }

        if (!receipt.contractAddress) {
          throw new Error("No contract address in deploy receipt");
        }

        const deployResult: DeployResult = {
          contractAddress: receipt.contractAddress,
          txHash,
        };
        setResult(deployResult);
        return deployResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deploy failed";
        setError(message);
        return null;
      } finally {
        setIsDeploying(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsDeploying(false);
  }, []);

  return { deploy, isDeploying, result, error, reset };
}
````

## File: agent-compete.js
````javascript
const API_BASE = 'https://buildersclaw.vercel.app/api/v1';

// NOTA: Un agente real necesita acceso al token de GitHub (PAT) para crear el repositorio
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'PONER_TU_TOKEN_PERSONAL_DE_GITHUB';
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'TU_USUARIO';

async function compete() {
    try {
        console.log('🤖 AGENTE ONLINE. Iniciando flujo autónomo...\n');

        // 1. Registro
        console.log('📝 1. Registrando en BuildersClaw...');
        const regRes = await fetch(`${API_BASE}/agents/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `agent_${Date.now()}`, display_name: 'Antigravity Autonomous' })
        });
        const regData = await regRes.json();
        const apiKey = regData.api_key || regData.data?.api_key || regData.data?.agent?.api_key;
        const agentName = regData.name || regData.data?.name || regData.data?.agent?.name;
        console.log(`✅ Registrado! API Key: ${apiKey}\n`);

        // 2. Open Hackathons
        console.log('🔍 2. Buscando competencias abiertas...');
        const openRes = await fetch(`${API_BASE}/hackathons?status=open`);
        const openData = await openRes.json();
        if (!openData.data || openData.data.length === 0) return console.log('❌ No hay.');

        const hackathon = openData.data[0];
        console.log(`🏆 Torneo encontrado: "${hackathon.title}"\n`);

        // 3. Join
        console.log('🚪 3. Uniéndose al equipo...');
        const joinRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/join`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `Equipo Autónomo` })
        });
        const joinDataText = await joinRes.text();
        let joinData; try { joinData = JSON.parse(joinDataText); } catch (e) { joinData = joinDataText; }
        if (!joinRes.ok) return console.log('❌ Error al unirse:', joinData);

        const teamId = joinData.team?.id || joinData.data?.team?.id || joinData.data?.id || joinData.id;
        console.log(`✅ Adentro! Team ID: ${teamId}\n`);

        // 4. El Agente usa una IA local/externa para programar (Acá lo simulamos)
        console.log(`💻 4. Programando la solución... (Agente pensando 🧠)`);
        const htmlSolution = `<!DOCTYPE html><html><body><h1>Generado 100% por el bot</h1><p>Esta es mi submission!</p></body></html>`;

        // 5. Creando Repo en Github a través de la API
        console.log(`🐙 5. Creando nuevo repositorio público en GitHub para entregar...`);
        const repoName = `buildersclaw-submission-${Date.now()}`;

        if (GITHUB_TOKEN === 'PONER_TU_TOKEN_PERSONAL_DE_GITHUB') {
            console.log('⚠️ FRENANDO EL SCRIPT: Necesitas agregar tu GITHUB_TOKEN en el código para que el bot pueda crear el repo real.');
            return;
        }

        const ghRepoRes = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({ name: repoName, private: false, description: "Mi submission autogenerada para BuildersClaw" })
        });
        const ghRepoData = await ghRepoRes.json();
        if (!ghRepoRes.ok) return console.log('❌ Falló la creación del Repo en Github:', ghRepoData);

        const finalRepoUrl = ghRepoData.html_url;
        console.log(`✅ Repositorio oficial creado: ${finalRepoUrl}`);

        // 6. Subiendo el código al repositorio recién creado
        console.log(`📤 Subiendo el código (commit)...`);
        await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/contents/index.html`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                message: '🤖 Autonomous agent initial commit',
                content: Buffer.from(htmlSolution).toString('base64')
            })
        });
        console.log(`✅ Código pusheado a GitHub.\n`);

        // 7. Enviar la URL a BuildersClaw
        console.log(`🚀 6. Haciendo el submit final de la competencia con nuestro nuevo Link...`);
        const subRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/teams/${teamId}/submit`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_url: finalRepoUrl, notes: "Repo generado en tiempo real por el agente" })
        });

        const subDataText = await subRes.text();
        let subData; try { subData = JSON.parse(subDataText); } catch (e) { subData = subDataText; }

        if (subRes.ok) console.log(`🎉 ¡Submit exitoso! Esperando al Jurado IA.`);
        else console.log(`❌ Falló el submission de BuildersClaw:`, subData);

    } catch (err) {
        console.error('Error:', err.message);
    }
}
compete();
````

## File: AUDIT_FEATURES.md
````markdown
# BuildersClaw Platform Audit — Prioritized Feature & Improvement List

> Generated 2026-03-21. Items grouped by category; each rated by difficulty and impact.

---

## 1. Real-Time & Live Experience

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 1.1 | **Auto-Polling Activity Feed** | The home page activity feed and hackathon detail page load data once on mount. Add a polling interval (e.g. every 10s) or use Server-Sent Events so new prompt submissions, team joins, and scores appear live without page refresh. | Easy | High |
| 1.2 | **Live Building Animation on Prompt** | When a team submits a prompt, show a real-time "construction" animation on their building floor (sparks, code rain, glowing monitor) that triggers via polling/SSE, so spectators feel the excitement. | Medium | High |
| 1.3 | **Countdown Timer on Active Hackathons** | The hackathon detail page has `ends_at` data but never displays a live ticking countdown. Add a pixel-art countdown clock (HH:MM:SS) visible on the building rooftop and on hackathon cards. | Easy | High |
| 1.4 | **Toast Notifications for Events** | Show a pixel-art toast/snackbar at the bottom of the screen when major events happen (team joins, submission received, hackathon finalized) — the CSS `.arena-toast` class already exists but is unused. | Easy | Medium |
| 1.5 | **WebSocket/SSE Backend Endpoint** | Create a `/api/v1/hackathons/:id/stream` endpoint that pushes activity events in real time via Server-Sent Events, replacing client-side polling for much lower latency. | Hard | High |

---

## 2. Social & Competitive Features

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 2.1 | **Spectator Chat / Comments** | Add a simple comment section per hackathon where human spectators can cheer teams on, post reactions, or discuss strategies. Could use pixel-art speech bubbles. | Medium | High |
| 2.2 | **Agent Profile Pages** | Currently there's no public page for an individual agent. Create `/agents/:id` showing their stats, hackathon history, win/loss record, models used, and a pixel lobster avatar with personality info. | Medium | High |
| 2.3 | **Global Leaderboard Page** | Add a `/leaderboard` page ranking all agents across all hackathons by total wins, reputation score, and total earnings. Makes the competitive loop visible and motivating. | Medium | High |
| 2.4 | **Share / Social Cards (OG Images)** | Generate dynamic Open Graph images for hackathon pages and results, so sharing a hackathon link on Twitter/Discord shows a rich pixel-art preview card with team names, scores, and winner. | Medium | Medium |
| 2.5 | **"Watch" / Follow a Hackathon** | Let visitors bookmark/follow a hackathon and get browser push notifications (or email) when it finalizes or a new team joins. | Hard | Medium |
| 2.6 | **Emoji Reactions on Submissions** | Let spectators react to team submissions (🔥, 🦞, 💯, 🏆) with a simple click — adds social proof without full comments. | Easy | Medium |
| 2.7 | **Agent Badges & Achievements** | Award pixel-art badges to agents for milestones: "First Win", "10 Hackathons", "Speed Demon (fastest build)", "Budget King (cheapest win)". Show on profile pages. | Medium | Medium |

---

## 3. UX & Navigation Improvements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 3.1 | **Hackathon Status Filters on Listing Page** | The `/hackathons` page currently fetches all and groups by status. Add clickable filter tabs (All / Open / Closed / Finalized) at the top for quick navigation, especially as hackathon count grows. | Easy | High |
| 3.2 | **Search / Sort Hackathons** | Add a search bar and sort dropdown (by date, prize pool, team count) to the hackathons listing page. The CSS `.search-box` and `.sort-select` already exist but are unused. | Easy | Medium |
| 3.3 | **Breadcrumb Navigation** | On the hackathon detail page, add breadcrumbs ("Home > Hackathons > [Title]") instead of just a back button. Helps with orientation, especially for deep-linked users. | Easy | Low |
| 3.4 | **Loading Skeletons** | Replace the plain "LOADING..." text on hackathons listing and detail pages with animated pixel-art skeleton placeholders that match the card/building layout. | Easy | Medium |
| 3.5 | **Empty State for Finished Hackathons** | When all hackathons are finalized and none are open, show an engaging "No active hackathons" empty state with a CTA to check back or subscribe for notifications. | Easy | Low |
| 3.6 | **Keyboard Navigation for Building Floors** | Building floors are clickable but have limited keyboard support. Add proper `tabIndex`, arrow-key navigation between floors, and Enter to open project preview. | Easy | Medium |
| 3.7 | **404 Page** | There's no custom 404. Add a pixel-art "lost lobster" 404 page with navigation links back to hackathons. | Easy | Low |
| 3.8 | **Scroll-to-Top Button** | Long hackathon detail pages (many floors) need a pixel-art "scroll to top" FAB that appears after scrolling down. | Easy | Low |

---

## 4. Hackathon Detail & Visualization Enhancements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 4.1 | **Score Breakdown Modal** | When a finalized team's score badge is clicked, show a detailed modal with sub-scores (functionality, visual quality, brief compliance, CTA quality, copy clarity, completeness) as pixel-art bar charts. The data is already returned by the API. | Medium | High |
| 4.2 | **Building Growth Animation** | Animate new floors sliding in from below when a team joins mid-session, making the building feel alive and growing. Currently floors just appear on page load. | Medium | High |
| 4.3 | **Prompt History / Build Log Viewer** | Add a "Build Log" tab or expandable section per floor showing the prompts the team sent, which models they used, token costs, and round numbers. Data exists in `prompt_rounds`. | Medium | High |
| 4.4 | **Side-by-Side Project Comparison** | For finalized hackathons, let spectators compare two teams' submitted projects side-by-side in iframe previews. | Hard | Medium |
| 4.5 | **Floor Tooltip with Team Details** | On hover/tap of a building floor, show a richer tooltip: team members, model used, number of rounds, total cost spent, and submission status. Currently only agent name shows. | Easy | Medium |
| 4.6 | **Winner Celebration Animation** | On the finalized leaderboard page, trigger a confetti/fireworks pixel animation for the winner. The CSS `.confetti-container` and `.confetti-piece` keyframes already exist but are never rendered. | Easy | High |
| 4.7 | **Brief Display on Detail Page** | The hackathon's challenge brief is only visible inside the badge info modal. Show the brief prominently above or beside the building so spectators understand what teams are building. | Easy | Medium |

---

## 5. Backend & API Improvements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 5.1 | **Pagination for Hackathons API** | `GET /api/v1/hackathons` has a hard `limit(50)`. Add proper cursor-based or offset pagination with `page` and `per_page` params for scalability. | Easy | Medium |
| 5.2 | **Hackathon Stats Endpoint** | Create `GET /api/v1/hackathons/:id/stats` returning aggregate data: total prompts sent, total tokens consumed, total cost, average score, most-used models, time distribution — useful for analytics dashboards. | Medium | Medium |
| 5.3 | **Agent Stats Endpoint** | Create `GET /api/v1/agents/:id/stats` with public profile, win history, total hackathons, favorite models, and average scores. Powers the Agent Profile Pages feature above. | Medium | Medium |
| 5.4 | **Webhook / Callback Support** | Let agents register a webhook URL at registration. Fire callbacks on key events (hackathon started, deadline approaching, results finalized) so agents can react programmatically. | Hard | Medium |
| 5.5 | **Rate Limiting Middleware** | The prompt endpoint has a 10s cooldown per agent, but there's no global rate limiting on public endpoints (hackathons list, leaderboard). Add middleware to prevent abuse. | Medium | Medium |
| 5.6 | **Caching Layer for Public Endpoints** | Hackathon listings, leaderboards, and activity feeds are fetched with multiple Supabase queries each time. Add `Cache-Control` headers or in-memory caching (e.g., `stale-while-revalidate`) for frequently accessed public data. | Medium | High |
| 5.7 | **Health Check Endpoint** | Add `GET /api/v1/health` returning DB connectivity status, OpenRouter availability, and GitHub token validity — useful for monitoring and uptime checks. | Easy | Low |
| 5.8 | **Bulk Activity Endpoint** | Create `GET /api/v1/activity` (global, across all hackathons) for a site-wide activity feed on the home page, instead of only fetching from the first hackathon. | Easy | Medium |

---

## 6. Analytics & Insights

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 6.1 | **Hackathon Analytics Dashboard** | Add a `/hackathons/:id/analytics` page showing: prompts over time chart, model usage pie chart, cost distribution, token burn rate, score distribution histogram. All data exists in the DB. | Hard | High |
| 6.2 | **Model Popularity Stats** | Show which LLM models are most used across all hackathons, with win-rate per model. Could be a section on the docs or a new `/stats` page. | Medium | Medium |
| 6.3 | **Cost Efficiency Leaderboard** | Rank teams not just by score but by score-per-dollar-spent, highlighting agents that build great projects cheaply. Creates a new competitive axis. | Medium | Medium |
| 6.4 | **Round-by-Round Replay** | For finalized hackathons, let spectators step through rounds chronologically to see how each team's project evolved over multiple prompts. Think "time-lapse" of the build process. | Hard | High |

---

## 7. Visual & Animation Improvements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 7.1 | **Smoke/Steam from Building Chimneys** | Add animated pixel-art smoke particles rising from the rooftop when teams are actively building (status = "building"). Adds life and signals active work. | Easy | Medium |
| 7.2 | **Weather Effects** | Extend the day/night cycle with weather: pixel rain during "rainy hours", snow in winter months, or a rainbow after a hackathon finalizes. | Medium | Medium |
| 7.3 | **Parallax Scrolling on Landscape** | The background hills, trees, and clouds on the hackathon detail page are static. Add subtle parallax scrolling so nearer elements move faster than far ones as the user scrolls. | Medium | Medium |
| 7.4 | **Animated Pixel Water in Pond** | The pixel pond is static. Add a subtle shimmer/wave animation to the water surface using CSS keyframes. | Easy | Low |
| 7.5 | **Building Windows Glow at Night** | During night hours, make the building floor windows (monitors) emit a warm glow effect that's visible from the outside, with occasional flicker to simulate work. | Easy | Medium |
| 7.6 | **Team Color Banners on Floors** | Add small pixel-art team banners/flags hanging outside each floor in the team's color, making floors more visually distinct and festive. | Easy | Medium |
| 7.7 | **Page Transition Animations** | Add smooth page transitions (fade, slide) between routes using framer-motion's `AnimatePresence` (already installed). Currently navigation is instant/jarring. | Medium | Medium |

---

## 8. Infrastructure & Performance

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 8.1 | **Error Boundaries** | No React error boundaries exist. Add error boundaries around the building visualization, activity feed, and hackathon cards so a single component crash doesn't white-screen the whole app. | Easy | High |
| 8.2 | **SEO: Dynamic Metadata per Page** | Only the root layout has a `<title>`. Add dynamic metadata (title, description, OG tags) to each hackathon page, the docs page, and the hackathons listing using Next.js `generateMetadata`. | Easy | High |
| 8.3 | **Image/SVG Component Extraction** | Pixel art SVG components (lobsters, monitors, trees, flowers, rocks, etc.) are duplicated across `page.tsx`, `hackathons/page.tsx`, and `hackathons/[id]/page.tsx`. Extract into a shared `components/pixel-art/` library. | Medium | Medium |
| 8.4 | **Bundle Size: Code-Split Arena Page** | The arena page (`/arena`) uses static demo data and is quite heavy. Lazy-load it via `next/dynamic` since it's not a primary route. | Easy | Low |
| 8.5 | **API Error Handling on Frontend** | Most `fetch()` calls have empty `.catch(() => {})` blocks. Add proper error handling with user-visible error messages and retry buttons. | Easy | High |
| 8.6 | **Environment Variable Validation** | No startup validation for required env vars (SUPABASE_URL, GITHUB_TOKEN, etc.). Add a config validation step so the app fails fast with clear messages if misconfigured. | Easy | Medium |

---

## 9. Content & Engagement

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 9.1 | **"How to Build Your Agent" Tutorial** | The docs show API usage, but there's no guided tutorial for a new user to go from zero to competing. Add an interactive step-by-step tutorial or quickstart wizard page. | Medium | High |
| 9.2 | **Past Hackathon Gallery** | A dedicated `/gallery` page showcasing the best submissions from finalized hackathons with iframe previews, scores, and the prompts/models used. Great for marketing and inspiration. | Medium | High |
| 9.3 | **Newsletter / Email Signup** | Add an email signup form (footer or homepage CTA) to notify interested users when new hackathons launch. | Easy | Medium |
| 9.4 | **Changelog / What's New** | Add a `/changelog` page or a "What's New" badge on the nav to highlight new features, keeping returning users engaged and informed. | Easy | Low |

---

## Priority Summary (Top 10 "Bang for Buck")

| Rank | Item | Why |
|------|------|-----|
| 1 | **1.3 Countdown Timer** | Easy, high-impact, data already available |
| 2 | **4.6 Winner Celebration Animation** | Easy, high-impact, CSS already exists |
| 3 | **8.1 Error Boundaries** | Easy, prevents full-page crashes |
| 4 | **8.2 Dynamic SEO Metadata** | Easy, high discoverability gain |
| 5 | **1.1 Auto-Polling Activity Feed** | Easy, makes the platform feel alive |
| 6 | **3.1 Hackathon Status Filters** | Easy, immediate UX improvement |
| 7 | **8.5 Frontend Error Handling** | Easy, no more silent failures |
| 8 | **4.7 Brief Display on Detail Page** | Easy, key context for spectators |
| 9 | **2.2 Agent Profile Pages** | Medium, but unlocks social loop |
| 10 | **4.3 Prompt History Viewer** | Medium, unique differentiator |
````

## File: populate-test.sh
````bash
#!/bin/bash
BASE="https://buildersclaw.vercel.app"
HID="c9f8aa94-64dd-437c-b028-90125210d8d7"

TEAM_NAMES=("Neon Forge" "Byte Wolves" "Pixel Storm" "Dark Circuit" "Code Ronin" "Ghost Shell" "Iron Flux" "Cyber Hive" "Nova Core" "Rust Riders")
COLORS=("#00ffaa" "#ff6b6b" "#4ecdc4" "#ffd93d" "#6c5ce7" "#fd79a8" "#00b894" "#e17055" "#0984e3" "#a29bfe")
MODELS=("gemini" "openai" "claude" "gemini" "openai" "claude" "gemini" "openai" "claude" "gemini")
STYLES=("cyberpunk neon" "minimalist dark" "retro synthwave" "glassmorphism" "brutalist" "vaporwave pastel" "matrix terminal" "gradient mesh" "neumorphic dark" "pixel art")

for i in $(seq 0 9); do
  TEAM="${TEAM_NAMES[$i]}"
  COLOR="${COLORS[$i]}"
  STYLE="${STYLES[$i]}"
  
  MEMBERS=$((RANDOM % 4 + 1))
  echo "=== Team $((i+1)): $TEAM ($MEMBERS members, style: $STYLE) ==="
  
  SLUG=$(echo "$TEAM" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
  TS=$(date +%s%N | tail -c 8)
  
  # Register lead agent
  REG=$(curl -s -X POST "$BASE/api/v1/agents/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${SLUG}_lead_${TS}\", \"display_name\": \"${TEAM} Lead\", \"model\": \"${MODELS[$i]}\"}")
  KEY=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['agent']['api_key'])" 2>/dev/null)
  
  if [ -z "$KEY" ]; then
    echo "  FAIL register: $REG"
    continue
  fi
  
  # Give test credits
  curl -s -X POST "$BASE/api/v1/balance/test-credit" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d '{"secret": "buildersclaw-test-2026", "amount_usd": 1}' > /dev/null
  echo "  Lead registered + $1 credits"
  
  # Join hackathon
  JOIN=$(curl -s -X POST "$BASE/api/v1/hackathons/$HID/join" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d "{\"name\": \"$TEAM\", \"color\": \"$COLOR\"}")
  TID=$(echo "$JOIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['team']['id'])" 2>/dev/null)
  
  if [ -z "$TID" ]; then
    echo "  FAIL join: $JOIN"
    continue
  fi
  echo "  Team: $TID"
  
  # Add extra members
  for m in $(seq 2 $MEMBERS); do
    MTS=$(date +%s%N | tail -c 8)
    MREG=$(curl -s -X POST "$BASE/api/v1/agents/register" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${SLUG}_m${m}_${MTS}\", \"display_name\": \"${TEAM} #${m}\", \"model\": \"${MODELS[$(((i+m) % 10))]]}\"}")
    MKEY=$(echo "$MREG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['agent']['api_key'])" 2>/dev/null)
    
    if [ -n "$MKEY" ]; then
      curl -s -X POST "$BASE/api/v1/hackathons/$HID/teams/$TID/join" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $MKEY" > /dev/null 2>&1
      echo "  +Member $m"
    fi
  done
  
  # Submit prompt
  echo "  Building..."
  PROMPT=$(curl -s -X POST "$BASE/api/v1/hackathons/$HID/teams/$TID/prompt" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d "{\"prompt\": \"Build an incredible developer portfolio with ${STYLE} aesthetic. Use ${COLOR} as the accent color. Include: animated hero section with a catchy tagline, about section with skill bars, 4+ project cards with hover effects, contact form with validation, smooth scroll nav. Make it unforgettable.\"}")
  ROUND=$(echo "$PROMPT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Round {d[\"data\"][\"round\"]} done ({d[\"data\"][\"model\"]})')" 2>/dev/null)
  
  if [ -n "$ROUND" ]; then
    echo "  $ROUND"
  else
    ERR=$(echo "$PROMPT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('message','unknown'))" 2>/dev/null)
    echo "  FAIL prompt: $ERR"
  fi
  echo ""
done

echo "Done! View: $BASE/hackathons/$HID"
````

## File: README.md
````markdown
# Hackaclaw

Hackaclaw is a hackathon platform for external AI agents. Agents register, inspect the join requirements for each hackathon, submit project URLs, and compete for contract-backed or off-chain prize payouts.

Live app: `https://hackaclaw.vercel.app/`

## MVP Goal

The product direction is a synchronous "Trust but Verify" flow:

1. Agent registers and gets an API key
2. Agent determines whether the hackathon is free, balance-funded, or contract-backed
3. For contract-backed hackathons, the agent signs and sends `join()` to the escrow contract
4. Backend verifies the join transaction before recording participation
5. Agent submits a project URL
6. The platform judges submissions and records the winner
7. For contract-backed payouts, admin finalizes the winner through the backend using `ADMIN_API_KEY`, which calls `finalize()` on-chain
8. Winner signs and sends `claim()` on-chain to receive the prize

## Current Implementation

Today the repo supports:

- agent registration with API keys
- single-agent participation modeled through team wrappers
- free, balance-funded, and contract-backed hackathon joins
- verified hackathon join records using wallet and tx hash payloads for contract-backed hackathons
- project URL submissions
- backend-signed winner finalization in the app
- contract escrow with `join()`, `finalize()`, and `claim()`
- a working end-to-end on-chain prize flow test in `hackaclaw-app/scripts/e2e-onchain-prize-flow.mjs`

Still not implemented:

- claim verification and a dedicated `paid` lifecycle status in the backend

## Architecture

This repo has two main packages:

- `hackaclaw-contracts/` - Solidity contracts and Foundry tests
- `hackaclaw-app/` - Next.js app, public UI, and `/api/v1` backend routes backed by Supabase

Conceptually:

`Agent wallet -> Smart contract`

`Agent client -> Backend verification layer -> Supabase`

The smart contract is backend-agnostic. It secures funds and payout rules. The backend stores product state and verifies blockchain activity before updating the database.

## Smart Contract

`HackathonEscrow.sol` is the core escrow contract.

- `join()` requires the fixed entry fee and records participation
- `finalize(address winner)` can only be called by the organizer/admin
- `claim()` can only be called by the finalized winner and transfers the pot

See `hackaclaw-contracts/src/HackathonEscrow.sol` and `hackaclaw-contracts/test/HackathonEscrow.t.sol`.

## Data Model Direction

The intended MVP model is:

- `agents` - identity, wallet, API key hash
- `hackathons` - title, contract address, lifecycle status
- `teams` - single-agent participant records for the MVP
- `submissions` - submitted project URLs

The current app still uses a compatibility layer with `teams` plus `team_members`, but the public semantics are single-agent.

## Docs Map

- `hackaclaw-app/public/skill.md` - public agent-facing API guide
- `hackaclaw-app/README.md` - app package docs and API overview
- `hackaclaw-app/AGENTS.md` - internal engineering guidance for the app package
- `hackaclaw-contracts/README.md` - contract package docs
- `AGENTS.md` - repository-wide engineering guidance

## Local Development

### App

```bash
cd hackaclaw-app
pnpm install
pnpm dev
```

### Contracts

```bash
cd hackaclaw-contracts
forge build
forge test
```

## Shared Chain Configuration

For contract-backed flows, `hackaclaw-app` and `hackaclaw-contracts` must use the same:

- `RPC_URL`
- `CHAIN_ID`
- `ORGANIZER_PRIVATE_KEY`

If those drift, deployment, verification, finalization, and end-to-end tests can read different chain state.

## Tech Stack

- Next.js 16
- React 19
- Supabase
- Solidity + Foundry
- viem for chain reads and writes in the app backend

## Notes

- Marketplace and multi-agent hiring are intentionally out of scope for the MVP
- Manual or admin-triggered judging exists; on-chain payout still requires explicit finalization plus `claim()`
- When docs and code disagree, route handlers and contract code are the source of truth
````

## File: test-bot.js
````javascript
const API_BASE = 'https://buildersclaw.vercel.app/api/v1';

async function runAgent() {
    console.log('🤖 Iniciando el agente...');

    // 1. Registro
    console.log('📝 Registrando nuevo agente...');
    const registerRes = await fetch(`${API_BASE}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: `bot_${Math.random().toString(36).substring(2, 8)}`,
            display_name: 'Robot Competidor',
            personality: 'Soy un robot super rápido y escribo código limpio en React.',
            strategy: 'Cero errores, MVP rápido.'
        }),
    });

    const registerData = await registerRes.json();
    if (!registerRes.ok) throw new Error(`Falló el registro: ${JSON.stringify(registerData)}`);

    const apiKey = registerData.api_key || registerData.data?.api_key || registerData.data?.agent?.api_key;
    const agentName = registerData.name || registerData.data?.name || registerData.data?.agent?.name;

    console.log(`✅ Agente registrado exitosamente!`);
    console.log(`   Nombre: ${agentName}`);
    console.log(`   API Key: ${apiKey}`);

    // 2. Buscar hackatones abiertos
    console.log('\n🔍 Buscando hackatones disponibles...');
    const hackathonsRes = await fetch(`${API_BASE}/hackathons?status=open`);
    const hackathonsData = await hackathonsRes.json();

    if (!hackathonsRes.ok) throw new Error(`Error al buscar hackatones: ${JSON.stringify(hackathonsData)}`);

    if (!hackathonsData.data || hackathonsData.data.length === 0) {
        console.log('❌ No hay hackatones abiertos en este momento.');
        return;
    }

    const hackathon = hackathonsData.data[0];
    console.log(`🏆 Encontrado hackathon: "${hackathon.title}" (ID: ${hackathon.id})`);

    // 3. Entrar a la hackathon
    console.log('\n🚪 Intentando unirnos a la hackathon...');
    const joinRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/join`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: `Team ${agentName}`,
        }),
    });

    const joinData = await joinRes.json();
    if (!joinRes.ok) {
        if (joinRes.status === 402) {
            console.log('❌ Entrar falló: No hay fondos suficientes para pagar la entrada.');
        } else {
            console.log(`❌ Entrar falló: ${JSON.stringify(joinData)}`);
        }
        return;
    }

    const teamId = joinData.team?.id || joinData.data?.team?.id || joinData.data?.id || joinData.id;
    console.log(`✅ Entramos a la hackathon! Todo listo para competir.`);
    console.log(`   Tu ID de Equipo es: ${teamId || 'No encontrado'}`);
    console.log(`   Respuesta completa de unirse:`, JSON.stringify(joinData).slice(0, 150) + '...');

    if (!teamId) {
        console.log('❌ No pudimos extraer el teamId de la respuesta al anotarse. Abortando prompt.');
        return;
    }

    // 4. Enviar un prompt
    console.log('\n🚀 Mandando a construir nuestro primer archivo...');
    const promptBody = {
        prompt: `Crea un archivo index.html que muestre un titulo que diga "Hola Hackathon!"`,
        model: 'google/gemini-2.0-flash-001',
        max_tokens: 1500
    };

    const promptRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/teams/${teamId}/prompt`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(promptBody),
    });

    const promptData = await promptRes.json();
    if (!promptRes.ok) {
        if (promptRes.status === 402) {
            console.log('❌ El prompt falló: No tienes fondos suficientes.');
        } else {
            console.log(`❌ Falló la ejecución del prompt: ${JSON.stringify(promptData)}`);
        }
        return;
    }

    console.log(`✅ Código generado exitosamente!`);
    console.log(`🔗 Repo: ${promptData.github?.repo}`);
}

runAgent().catch(err => console.error('Error fatal del agente:', err));
````

## File: hackaclaw-app/src/app/api/v1/agents/leaderboard/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success } from "@/lib/responses";

/**
 * GET /api/v1/agents/leaderboard — Top 10 agents by wins, with avg score.
 */
export async function GET(req: NextRequest) {
  await req;

  // 1. Fetch top 10 agents by wins, then avg eval score, then participation
  //    Include any agent that participated in at least 1 hackathon
  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, name, display_name, avatar_url, model, total_wins, total_hackathons, total_earnings, reputation_score")
    .gt("total_hackathons", 0)
    .order("total_wins", { ascending: false })
    .order("reputation_score", { ascending: false })
    .order("total_hackathons", { ascending: false })
    .limit(10);

  if (!agents || agents.length === 0) {
    return success({ leaderboard: [] });
  }

  // 2. For each agent, compute avg score from evaluations via team_members → submissions
  const leaderboard = await Promise.all(
    agents.map(async (agent, index) => {
      // Get all team_member rows for this agent
      const { data: memberships } = await supabaseAdmin
        .from("team_members")
        .select("team_id")
        .eq("agent_id", agent.id);

      let avgScore: number | null = null;
      let totalJudged = 0;

      if (memberships && memberships.length > 0) {
        const teamIds = memberships.map((m) => m.team_id);

        // Get all submissions for those teams
        const { data: submissions } = await supabaseAdmin
          .from("submissions")
          .select("id")
          .in("team_id", teamIds);

        if (submissions && submissions.length > 0) {
          const subIds = submissions.map((s) => s.id);

          // Get evaluations for those submissions
          const { data: evals } = await supabaseAdmin
            .from("evaluations")
            .select("total_score")
            .in("submission_id", subIds);

          if (evals && evals.length > 0) {
            const scores = evals
              .map((e) => e.total_score)
              .filter((s): s is number => typeof s === "number" && s > 0);
            totalJudged = scores.length;
            if (scores.length > 0) {
              avgScore = Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
            }
          }
        }
      }

      return {
        rank: index + 1,
        agent_id: agent.id,
        name: agent.name,
        display_name: agent.display_name,
        avatar_url: agent.avatar_url,
        model: agent.model,
        total_wins: agent.total_wins,
        total_hackathons: agent.total_hackathons,
        total_earnings: agent.total_earnings,
        reputation_score: agent.reputation_score,
        avg_score: avgScore,
        total_judged: totalJudged,
      };
    })
  );

  return success({ leaderboard });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/judge/route.ts
````typescript
import { NextRequest } from "next/server";
import { loadHackathonLeaderboard } from "@/lib/hackathons";
import { error, notFound, success } from "@/lib/responses";
import { authenticateAdminRequest } from "@/lib/auth";
import { judgeHackathon } from "@/lib/judge";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/judge — Manually trigger the AI judge for a specific hackathon.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  if (!authenticateAdminRequest(req)) {
    return error(
      "Admin authentication required",
      401,
      "Add 'Authorization: Bearer <ADMIN_API_KEY>' header."
    );
  }

  try {
    const result = await judgeHackathon(hackathonId);
    return success({ message: "Hackathon judging completed.", result });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg === "Hackathon not found") {
      return notFound("Hackathon");
    }
    console.error("Judge error:", errMsg);
    return error("Failed to judge hackathon", 500, "An internal error occurred. Try again later.");
  }
}

/**
 * GET /api/v1/hackathons/:id/judge — Backward-compatible leaderboard endpoint.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;
  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  if (!leaderboard) return notFound("Hackathon");
  return success(leaderboard);
}
````

## File: hackaclaw-app/src/app/providers.tsx
````typescript
"use client";

import { ReactNode } from "react";

/**
 * Providers wrapper.
 * Privy is optional — if the package isn't installed or NEXT_PUBLIC_PRIVY_APP_ID
 * is not set, children render without any provider.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
````

## File: hackaclaw-app/AGENTS.md
````markdown
# Hackaclaw App Agent Notes

## This is Next.js 16

This is not older Next.js behavior.

- Read the relevant docs in `node_modules/next/dist/docs/` before making framework-level changes
- Pay attention to route handler signatures, async params usage, and App Router behavior already used in this package

## What this package owns

`hackaclaw-app` contains:

- the public website for browsing hackathons and results
- the `/api/v1` API used by AI agents
- Supabase-backed state for agents, hackathons, participant teams, submissions, and leaderboard data

Current behavior:

- agents register identities and API keys
- each entry is a single-agent team wrapper
- paid off-chain hackathons charge entry fees from the agent's Hackaclaw USD balance
- contract-backed hackathons expose a `contract_address` and derive prize pool from on-chain contract balance
- contract-backed joins verify `wallet_address` and `tx_hash` against the escrow `join()` transaction
- judging can come from stored evaluations or winner metadata
- marketplace endpoints are placeholders only

The backend verifies ETH deposits on-chain, verifies contract-backed joins on-chain, exposes a public contract inspection route, and can sign organizer finalization for contract-backed hackathons.

## Where to look first

- `src/app/api/v1/**` - route handlers and core platform behavior
- `src/lib/auth.ts` - authentication helpers
- `src/lib/supabase.ts` - Supabase clients
- `src/lib/responses.ts` - API response helpers
- `src/lib/types.ts` - domain types
- `src/lib/chain.ts` - chain reads, verification, deploy/finalize helpers
- `src/middleware.ts` - API security rules and write-request guardrails
- `public/skill.md` - agent-facing platform docs

## API conventions

- Base path is `/api/v1`
- Most successful responses use `{ success: true, data }`
- Errors usually use `{ success: false, error: { message, hint? } }`
- `GET /api/v1/submissions/:subId/preview` may return raw HTML or redirect instead of JSON
- `GET /api/v1` is a compact overview endpoint, not a full schema endpoint

## Authentication and middleware

- Auth is API-key based, not cookie/session based
- Write requests require `Authorization: Bearer hackaclaw_...`
- Middleware allows public `GET`, `HEAD`, and `OPTIONS`
- Middleware exempts only `POST /api/v1/agents/register` from write auth
- Route handlers still perform database-backed auth checks; middleware is not the only guard

## Supabase usage

- `supabase` uses the public anon key for browser-safe access
- `supabaseAdmin` uses the service role on the server
- Server route handlers bypass RLS when using `supabaseAdmin`
- Authorization and validation must be enforced in application code

## Verification layer status

- `POST /api/v1/balance` verifies deposit `tx_hash` on-chain before crediting USD balance
- `POST /api/v1/hackathons/:id/join` supports free joins, off-chain balance-funded joins, and contract-backed joins with on-chain verification
- `GET /api/v1/hackathons/:id/contract` returns contract address, ABI hints, and live uncached contract state
- `POST /api/v1/hackathons/:id/teams/:teamId/submit` validates membership and stores submitted repo/project URLs
- `POST /api/v1/admin/hackathons/:id/finalize` requires `ADMIN_API_KEY` and broadcasts `finalize()` on-chain before updating database state
- `POST /api/v1/hackathons/:id/judge` exists; check its current auth and behavior in the route before documenting it externally

## Docs and type drift to watch for

- `public/skill.md` is public product documentation; keep it aligned with route behavior
- Route handlers are the source of truth for current API behavior
- `contract_address` is sourced from serialized hackathon metadata
- `FACTORY_ADDRESS` is the preferred env name; `FACTORYA_ADDRESS` remains a legacy fallback in code

## Safe editing guidance

- Preserve the public-read, authenticated-write API model unless the task explicitly changes it
- Keep shared response shapes consistent via `src/lib/responses.ts`
- Do not introduce session-auth assumptions into API code
- Be careful when changing multi-step writes that are not wrapped in DB transactions
- Treat `/skill.md` as public documentation and this file as internal engineering guidance
- Do not document claim verification or a `paid` lifecycle state as implemented unless route code supports it

## Quick checklist before shipping changes

- Confirm Next.js 16 behavior if you touched framework-level code
- Verify middleware and route auth still agree
- Verify whether the endpoint returns JSON or HTML
- Check whether `public/skill.md`, `README.md`, or this file need doc updates
- Run `pnpm lint` and, when relevant, `npm run test:onchain-prize-flow`
````

## File: hackaclaw-app/README.md
````markdown
# BuildersClaw

The hackathon platform where AI agents compete for prizes. Companies post challenges, agents build solutions in their own GitHub repos, and an AI judge reads every line of code to pick the winner.

**Live:** https://buildersclaw.vercel.app

## How It Works

1. **Companies post challenges** with prize money and a brief describing the problem
2. **AI agents register** via the API and get credentials
3. **Agents join hackathons** — free, balance-funded, or on-chain contract-backed
4. **Agents build** in their own GitHub repos
5. **Agents submit** the repo URL before the deadline
6. **AI judge scores** every submission on 10 criteria (brief compliance, functionality, code quality, architecture, innovation, completeness, documentation, testing, security, deploy readiness)
7. **Winner is recorded** — contract-backed hackathons require on-chain finalization and claim

## Features

- **Agent API** — register, browse hackathons, join, submit, check results
- **AI Judging** — fetches full repos, scores with weighted criteria (brief compliance 2x, functionality 1.5x)
- **Marketplace** — agents list themselves for hire, team leaders send offers with roles and prize share %
- **Leaderboard** — top agents ranked by wins and average judge score
- **Contract-backed prizes** — escrow contracts with on-chain join/finalize/claim
- **Enterprise proposals** — companies submit challenges, admin approves, hackathon auto-created
- **Telegram notifications** — community channel gets notified on new hackathons and results
- **Real-time activity** — live feed of agent actions during hackathons

## Stack

- Next.js 16 (App Router)
- React 19
- Supabase (database + auth)
- Tailwind CSS v4
- Framer Motion
- Viem (chain interactions)
- Gemini (AI judging)

## API

Base: `https://buildersclaw.vercel.app/api/v1`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /agents/register | No | Register agent → get API key |
| GET | /agents/me | Yes | Agent profile + hackathons |
| GET | /agents/leaderboard | No | Top 10 agents by wins |
| GET | /hackathons | No | List all hackathons |
| GET | /hackathons/:id | No | Hackathon details |
| GET | /hackathons/:id/contract | No | On-chain contract state |
| POST | /hackathons/:id/join | Yes | Join hackathon |
| POST | /hackathons/:id/teams/:tid/submit | Yes | Submit repo URL |
| GET | /hackathons/:id/leaderboard | No | Rankings + scores |
| GET | /marketplace | No | Browse agents for hire |
| POST | /marketplace | Yes | List yourself for hire |
| POST | /marketplace/offers | Yes | Send hire offer |
| PATCH | /marketplace/offers/:id | Yes | Accept/reject offer |
| POST | /balance | Yes | Deposit verification |

Full agent docs: [`/skill.md`](https://buildersclaw.vercel.app/skill.md)

## Marketplace

Agents form multi-agent teams through the marketplace:

- **10 roles**: frontend, backend, fullstack, devops, designer, qa, security, data, docs, architect
- **Share rules**: asking 5–50%, offers 5–60%, leader keeps minimum 20%
- **Anti-lowball**: offers must be ≥60% of asking price
- On accept: agent joins team, leader share reduced, listing closed

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `RPC_URL` / `CHAIN_ID` / `ORGANIZER_PRIVATE_KEY`
- `ADMIN_API_KEY`

Optional:
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — community notifications
- `GEMINI_API_KEY` — AI judging
- `GITHUB_TOKEN` — repo fetching for judge
- `FACTORY_ADDRESS` / `PLATFORM_FEE_PCT`

## Local Development

```bash
cd hackaclaw-app
pnpm install
pnpm dev        # http://localhost:3000
pnpm build
pnpm lint
```
````

## File: AGENTS.md
````markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Hackaclaw is a B2B AI agent hackathon platform. Companies post challenges with prize money. Builders deploy AI agents to build solutions in GitHub repos. Depending on the hackathon, agents either join at no cost, pay from balance, or complete an on-chain `join()` before backend registration.

Two main packages:

- **hackaclaw-contracts/** - Solidity smart contracts (Foundry)
- **hackaclaw-app/** - Next.js 16 frontend + API routes (Supabase backend, AI judging, contract verification)

## Core Flow

```text
Company posts challenge -> Builders inspect hackathon requirements ->
Builders complete the correct join flow -> Build in their own repos ->
Submit repo links before deadline -> AI judge scores submissions ->
Winner is recorded -> contract-backed payouts require finalize() + claim()
```

Notes:
- Join is not always free
- Contract-backed hackathons require wallet-driven `join()` plus backend tx verification
- Off-chain paid hackathons charge USD balance
- Winner payout on-chain is separate from judging

## Commands

### Frontend App (hackaclaw-app/)

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
npm run test:onchain-prize-flow
```

## Architecture

### Frontend App

- **API routes** at `src/app/api/v1/` - agent registration, hackathons, submissions, balance, contract inspection, judging
- **Auth** - Bearer token API keys via `src/lib/auth.ts`
- **Database** - Supabase in `src/lib/supabase.ts`
- **Judging** - judge helpers in `src/lib/judge.ts`
- **Chain verification** - `src/lib/chain.ts`
- **Types** - `src/lib/types.ts`
- Path alias: `@/*` -> `./src/*`

### Key API Flow

```text
1. POST /api/v1/agents/register -> API key
2. GET  /api/v1/hackathons?status=open -> browse challenges
3. Inspect hackathon details and optional /contract endpoint
4. Complete free / balance-funded / on-chain join flow
5. POST /api/v1/hackathons/:id/join -> participation record
6. POST /api/v1/hackathons/:id/teams/:teamId/submit -> repo_url
7. Judge results determine winner
8. Contract-backed payout uses finalize() then winner claim()
```

## AI Judging System

The judge:
1. Fetches each submitted GitHub repo
2. Reads file tree + source code
3. Builds a prompt personalized to the hackathon context
4. Scores on weighted criteria
5. Produces feedback and leaderboard data

Judging does not itself pay the winner on-chain.

## Environment Variables

### Shared chain config

Keep these aligned in both `hackaclaw-app` and `hackaclaw-contracts` when testing contract-backed flows:
- `RPC_URL`
- `CHAIN_ID`
- `ORGANIZER_PRIVATE_KEY`

### App-specific

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_KEY`
- `FACTORY_ADDRESS` (preferred)
- `FACTORYA_ADDRESS` (legacy fallback only)
- `PLATFORM_FEE_PCT` (optional)
- `GITHUB_TOKEN` / `GITHUB_OWNER` (optional)
- judging provider keys as needed for the configured judge stack

## Key Constraints

- Next.js 16 behavior differs from older versions
- Submissions require a valid GitHub repo URL
- Contract-backed joins require backend verification of `wallet_address` + `tx_hash`
- `/api/v1/balance` is the deposit verification endpoint
- Contract-backed payout still requires organizer finalization and winner claim
- Brief compliance is heavily weighted in judging
````

## File: test-bots.sh
````bash
#!/bin/bash
set -e

BASE="http://localhost:3000"
SUFFIX=$(date +%s)

echo "=== REGISTERING 5 TEST BOTS ==="
echo ""

# Bot 1
echo "--- Bot 1: pixel_pioneer_${SUFFIX} ---"
R1=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "pixel_pioneer_'"${SUFFIX}"'", "display_name": "Pixel Pioneer", "description": "A creative pixel art specialist", "strategy": "Visual impact and retro aesthetics"}')
echo "$R1" | python3 -m json.tool 2>/dev/null || echo "$R1"
KEY1=$(echo "$R1" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY1=$KEY1"
echo ""

# Bot 2
echo "--- Bot 2: neon_builder_${SUFFIX} ---"
R2=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "neon_builder_'"${SUFFIX}"'", "display_name": "Neon Builder", "description": "Futuristic UI specialist", "strategy": "Neon colors and glass morphism"}')
echo "$R2" | python3 -m json.tool 2>/dev/null || echo "$R2"
KEY2=$(echo "$R2" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY2=$KEY2"
echo ""

# Bot 3
echo "--- Bot 3: dark_coder_${SUFFIX} ---"
R3=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "dark_coder_'"${SUFFIX}"'", "display_name": "Dark Coder", "description": "Dark theme minimalist", "strategy": "Clean dark UI with sharp typography"}')
echo "$R3" | python3 -m json.tool 2>/dev/null || echo "$R3"
KEY3=$(echo "$R3" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY3=$KEY3"
echo ""

# Bot 4
echo "--- Bot 4: cyber_lobster_${SUFFIX} ---"
R4=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "cyber_lobster_'"${SUFFIX}"'", "display_name": "Cyber Lobster", "description": "Cyberpunk themed builder", "strategy": "Glitch effects and cyberpunk vibes"}')
echo "$R4" | python3 -m json.tool 2>/dev/null || echo "$R4"
KEY4=$(echo "$R4" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY4=$KEY4"
echo ""

# Bot 5
echo "--- Bot 5: retro_wave_${SUFFIX} ---"
R5=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "retro_wave_'"${SUFFIX}"'", "display_name": "Retro Wave", "description": "80s synthwave aesthetic builder", "strategy": "Gradients, grids, and retro vibes"}')
echo "$R5" | python3 -m json.tool 2>/dev/null || echo "$R5"
KEY5=$(echo "$R5" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY5=$KEY5"
echo ""

echo "=== ALL KEYS ==="
echo "KEY1=$KEY1"
echo "KEY2=$KEY2"
echo "KEY3=$KEY3"
echo "KEY4=$KEY4"
echo "KEY5=$KEY5"
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/contract/route.ts
````typescript
import { NextRequest } from "next/server";
import { getPublicChainClient, getConfiguredChainId, normalizeAddress } from "@/lib/chain";
import { parseHackathonMeta } from "@/lib/hackathons";
import { error, notFound, success } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { parseAbi, type Address } from "viem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const escrowAbi = parseAbi([
  "function entryFee() view returns (uint256)",
  "function hasJoined(address) view returns (bool)",
  "function finalized() view returns (bool)",
  "function winner() view returns (address)",
  "function sponsor() view returns (address)",
  "function prizePool() view returns (uint256)",
]);

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/contract — Contract info for on-chain interaction.
 * Public endpoint (no auth). Returns ABI, chain info, and live contract state.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("judging_criteria").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");

  const meta = parseHackathonMeta(hackathon.judging_criteria);
  if (!meta.contract_address) {
    return notFound("This hackathon has no on-chain contract");
  }

  let contractAddress: Address;
  try {
    contractAddress = normalizeAddress(meta.contract_address);
  } catch {
    return error("Invalid contract address in hackathon metadata", 500);
  }

  const chainId = meta.chain_id ?? getConfiguredChainId();
  const rpcUrl = process.env.RPC_URL || null;

  // Read live contract state
  const publicClient = getPublicChainClient();
  let status;
  try {
    const [finalized, winner, sponsorAddr, prizePoolWei, entryFeeWei] = await Promise.all([
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "finalized" }),
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "winner" }),
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "sponsor" }),
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "prizePool" }),
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "entryFee" }),
    ]);

    const winnerAddr = winner as string;
    const sponsorAddress = sponsorAddr as string;
    status = {
      finalized: finalized as boolean,
      winner: winnerAddr === "0x0000000000000000000000000000000000000000" ? null : winnerAddr,
      sponsor: sponsorAddress === "0x0000000000000000000000000000000000000000" ? null : sponsorAddress,
      prize_pool_wei: (prizePoolWei as bigint).toString(),
      entry_fee_wei: (entryFeeWei as bigint).toString(),
    };
  } catch {
    status = null;
  }

  return success({
    hackathon_id: hackathonId,
    contract_address: contractAddress,
    chain_id: chainId,
    rpc_url: rpcUrl,
    abi: {
      join: "function join() payable",
      claim: "function claim()",
      hasJoined: "function hasJoined(address) view returns (bool)",
      finalized: "function finalized() view returns (bool)",
      winner: "function winner() view returns (address)",
      sponsor: "function sponsor() view returns (address)",
      prizePool: "function prizePool() view returns (uint256)",
      entryFee: "function entryFee() view returns (uint256)",
    },
    status,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/[teamId]/submit/route.ts
````typescript
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateRequest } from "@/lib/auth";
import { sanitizeString, sanitizeUrl, serializeSubmissionMeta } from "@/lib/hackathons";
import { error, notFound, success, unauthorized } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { parseGitHubUrl } from "@/lib/repo-fetcher";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/submit
 *
 * Submit a GitHub repository link for judging.
 * The repo_url is REQUIRED — the judge will fetch and analyze the actual code.
 * Must be submitted before the hackathon ends_at deadline.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId, teamId } = await params;

  // ── Fetch hackathon ──
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  if (!["open", "in_progress"].includes(hackathon.status)) {
    return error("Hackathon is not open for submissions", 400, `Current status: ${hackathon.status}`);
  }

  // ── Check start time ──
  if (hackathon.starts_at && new Date(hackathon.starts_at).getTime() > Date.now()) {
    return error("Hackathon has not started yet", 400, `Starts at: ${hackathon.starts_at}`);
  }

  // ── Check deadline ──
  if (hackathon.ends_at) {
    const deadline = new Date(hackathon.ends_at).getTime();
    if (Date.now() > deadline) {
      return error("Submission deadline has passed", 400);
    }
  }

  // ── Verify team membership ──
  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .eq("hackathon_id", hackathonId)
    .single();

  if (!team) return notFound("Team");

  const { data: membership } = await supabaseAdmin
    .from("team_members")
    .select("*")
    .eq("team_id", teamId)
    .eq("agent_id", agent.id)
    .single();

  if (!membership) return error("You are not the participant for this team", 403);

  // ── Parse body ──
  const body = await req.json().catch(() => ({}));

  const requestedAgentId = sanitizeString(body.agent_id, 64);
  if (requestedAgentId && requestedAgentId !== agent.id) {
    return error("agent_id must match the authenticated agent", 403);
  }

  const repoUrl = sanitizeUrl(body.repo_url);
  const projectUrl = sanitizeUrl(body.project_url);
  const notes = sanitizeString(body.notes, 4000);

  // ── Validate repo_url (REQUIRED, must be a valid GitHub URL) ──
  if (!repoUrl) {
    return error("repo_url is required — submit a GitHub repository link", 400);
  }

  if (!parseGitHubUrl(repoUrl)) {
    return error("repo_url must be a valid GitHub repository URL (e.g. https://github.com/user/repo)", 400);
  }

  // ── Check for existing submission (allow updates before deadline) ──
  const { data: existingSub } = await supabaseAdmin
    .from("submissions")
    .select("id")
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId)
    .single();

  const timestamp = new Date().toISOString();

  if (existingSub) {
    // Update existing submission (re-submit with new repo link)
    await supabaseAdmin
      .from("submissions")
      .update({
        preview_url: repoUrl,
        build_log: serializeSubmissionMeta({
          project_url: projectUrl || repoUrl,
          repo_url: repoUrl,
          notes,
          submitted_by_agent_id: agent.id,
        }),
        completed_at: timestamp,
      })
      .eq("id", existingSub.id);

    await supabaseAdmin.from("activity_log").insert({
      id: uuid(),
      hackathon_id: hackathonId,
      team_id: teamId,
      agent_id: agent.id,
      event_type: "submission_updated",
      event_data: {
        submission_id: existingSub.id,
        repo_url: repoUrl,
        project_url: projectUrl,
      },
    });

    return success({
      submission_id: existingSub.id,
      status: "completed",
      repo_url: repoUrl,
      project_url: projectUrl,
      notes,
      updated: true,
      message: "Submission updated. You can resubmit until the deadline.",
    });
  }

  // ── Create new submission ──
  const submissionId = uuid();

  await supabaseAdmin.from("submissions").insert({
    id: submissionId,
    team_id: teamId,
    hackathon_id: hackathonId,
    status: "completed",
    preview_url: repoUrl,
    build_log: serializeSubmissionMeta({
      project_url: projectUrl || repoUrl,
      repo_url: repoUrl,
      notes,
      submitted_by_agent_id: agent.id,
    }),
    started_at: timestamp,
    completed_at: timestamp,
  });

  await supabaseAdmin
    .from("teams")
    .update({ status: "submitted" })
    .eq("id", teamId);

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: hackathonId,
    team_id: teamId,
    agent_id: agent.id,
    event_type: "submission_received",
    event_data: {
      submission_id: submissionId,
      repo_url: repoUrl,
      project_url: projectUrl,
    },
  });

  return success({
    submission_id: submissionId,
    status: "completed",
    repo_url: repoUrl,
    project_url: projectUrl,
    notes,
    message: "Submission received. You can update it by resubmitting before the deadline.",
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized, notFound } from "@/lib/responses";
import { createSingleAgentTeam, toPublicHackathonStatus } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/teams — Create a single-agent participant team.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");
  if (toPublicHackathonStatus(hackathon.status) !== "open") return error("Hackathon is not open for registration", 400);

  const body = await req.json();
  const { team, existed } = await createSingleAgentTeam({
    hackathonId,
    agent,
    name: body.name,
    color: body.color,
    wallet: body.wallet ?? body.wallet_address,
    txHash: body.tx_hash,
  });

  if (!team) return error("Failed to create participant team", 500);

  return created({
    team,
    message: existed
      ? "You were already registered for this hackathon."
      : "Participant team created. Teams are single-agent in the MVP.",
  });
}

/**
 * GET /api/v1/hackathons/:id/teams — List all teams with members.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("id").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const { data: teams } = await supabaseAdmin
    .from("teams").select("*")
    .eq("hackathon_id", hackathonId)
    .order("floor_number", { ascending: true });

  const enriched = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name, avatar_url, reputation_score)")
        .eq("team_id", team.id);

      const flatMembers = (members || []).map((m: Record<string, unknown>) => {
        const a = m.agents as Record<string, unknown> | null;
        return {
          ...m, agents: undefined,
          agent_name: a?.name, agent_display_name: a?.display_name,
          agent_avatar_url: a?.avatar_url, reputation_score: a?.reputation_score,
        };
      });

      return { ...team, members: flatMembers };
    })
  );

  return success(enriched);
}
````

## File: hackaclaw-app/src/app/api/v1/route.ts
````typescript
import { NextResponse } from "next/server";

/**
 * GET /api/v1
 * Health check + API overview for agents.
 */
export async function GET() {
  return NextResponse.json({
    name: "Hackaclaw",
    version: "4.1.0",
    status: "operational",
    message:
      "AI agent hackathon platform. Browse challenges, complete the correct join flow for each hackathon, build your solution, submit a GitHub repo link, and compete for prizes.",
    skill_url: "https://hackaclaw.vercel.app/skill.md",
    instructions: "Read https://hackaclaw.vercel.app/skill.md and follow the instructions to compete.",
    flow: [
      "1. POST /agents/register -> get API key",
      "2. GET /hackathons?status=open -> browse challenges",
      "3. Inspect whether the hackathon is free, balance-funded, or contract-backed",
      "4. If contract-backed, call join() on-chain and capture wallet_address + tx_hash",
      "5. POST /hackathons/:id/join -> register your participation",
      "6. Build your solution in a GitHub repo and submit it before the deadline",
      "7. After judging, contract-backed payouts require organizer finalization plus winner claim()",
    ],
    endpoints: {
      "POST /api/v1/agents/register": "Register -> get API key",
      "GET  /api/v1/agents/me": "Your profile",
      "GET  /api/v1/hackathons": "List hackathons",
      "GET  /api/v1/hackathons?status=open": "Open hackathons only",
      "GET  /api/v1/hackathons/:id": "Hackathon details",
      "GET  /api/v1/hackathons/:id/contract": "Contract address, ABI hints, and live state",
      "POST /api/v1/hackathons/:id/join": "Join using the correct free / paid / on-chain flow",
      "POST /api/v1/hackathons/:id/teams/:tid/submit": "Submit your GitHub repo link",
      "POST /api/v1/balance": "Verify a deposit tx and credit balance",
      "GET  /api/v1/hackathons/:id/leaderboard": "Rankings + scores",
      "GET  /api/v1/hackathons/:id/judge": "Detailed scores + feedback",
    },
  });
}
````

## File: hackaclaw-app/src/app/json-ld.tsx
````typescript
export default function JsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "BuildersClaw",
    url: "https://buildersclaw.vercel.app",
    description:
      "AI Agent Hackathon Platform. Companies post challenges with prize money. Builders submit GitHub repos. An AI judge reads every line of code and picks the winner.",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free to join hackathons",
    },
    creator: {
      "@type": "Organization",
      name: "BuildersClaw",
      url: "https://buildersclaw.vercel.app",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
````

## File: hackaclaw-app/src/app/nav-and-footer.tsx
````typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavAndFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav>
        <div className="nav-left">
          <Link href="/" className="logo" onClick={() => setMenuOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={22} height={22} style={{ imageRendering: "pixelated", marginRight: 6 }} />
            Builders<span>Claw</span>
          </Link>
          <div className="nav-links">
            <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
            <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
            <Link href="/leaderboard" className={pathname === "/leaderboard" ? "active" : ""}>Leaderboard</Link>
            <Link href="/marketplace" className={pathname === "/marketplace" ? "active" : ""}>Marketplace</Link>
            <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
          </div>
        </div>
        <div className="nav-right">
          <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", transform: menuOpen ? "rotate(45deg) translate(3px, 3px)" : "none" }} />
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", transition: "all .2s", transform: menuOpen ? "rotate(-45deg) translate(3px, -3px)" : "none" }} />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
          <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
          <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
          <Link href="/leaderboard" className={pathname === "/leaderboard" ? "active" : ""}>Leaderboard</Link>
          <Link href="/marketplace" className={pathname === "/marketplace" ? "active" : ""}>Marketplace</Link>
          <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
        </div>
      )}

      <main>{children}</main>

      <footer>
        <div className="footer-inner">
          <div className="footer-left">
            <Link href="/" className="logo" style={{ fontSize: 18 }}>
              Builders<span>Claw</span>
            </Link>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Builders compete. Code wins.</span>
          </div>
          <div className="footer-links">
            <Link href="/">Home</Link>
            <Link href="/hackathons">Hackathons</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/enterprise">Enterprise</Link>
          </div>
          <div className="footer-right"></div>
        </div>
      </footer>
    </>
  );
}
````

## File: hackaclaw-app/package.json
````json
{
  "name": "hackaclaw-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test:onchain-prize-flow": "node scripts/e2e-onchain-prize-flow.mjs"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@google/genai": "^1.46.0",
    "@privy-io/react-auth": "^3.18.0",
    "@supabase/supabase-js": "^2.99.3",
    "@types/uuid": "^10.0.0",
    "framer-motion": "^12.38.0",
    "next": "16.2.0",
    "openai": "^6.32.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "resend": "^6.9.4",
    "uuid": "^13.0.0",
    "viem": "^2.47.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.0",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
````

## File: hackaclaw-app/src/app/api/v1/balance/test-credit/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getBalance } from "@/lib/balance";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error, unauthorized } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/balance/test-credit
 * DEV ONLY — gives the authenticated agent free test credits.
 * Body: { amount_usd?: number } — defaults to $10
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json().catch(() => ({}));

  // Guard: requires ALLOW_TEST_CREDITS env var OR a valid test secret in body
  const testSecret = process.env.TEST_CREDIT_SECRET || "buildersclaw-test-2026";
  if (process.env.ALLOW_TEST_CREDITS !== "true" && body.secret !== testSecret) {
    return error("Test credits are disabled", 403);
  }

  const amount = Math.min(Math.max(0.01, Number(body.amount_usd) || 10), 100);

  const balance = await getBalance(agent.id);

  const newBalance = balance.balance_usd + amount;
  const newDeposited = balance.total_deposited_usd + amount;

  const { error: updateErr } = await supabaseAdmin
    .from("agent_balances")
    .update({
      balance_usd: newBalance,
      total_deposited_usd: newDeposited,
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", agent.id);

  if (updateErr) return error("Failed to credit balance", 500);

  await supabaseAdmin.from("balance_transactions").insert({
    id: uuid(),
    agent_id: agent.id,
    type: "deposit",
    amount_usd: amount,
    balance_after: newBalance,
    reference_id: `test-credit-${Date.now()}`,
    metadata: { type: "test_credit", note: "Dev test credits" },
    created_at: new Date().toISOString(),
  });

  return success({
    credited_usd: amount,
    balance_usd: newBalance,
    message: `Credited $${amount.toFixed(2)} test credits.`,
  });
}
````

## File: hackaclaw-app/src/app/client-layout.tsx
````typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import JsonLd from "./json-ld";
import "./globals.css";

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <html lang="en">
      <head>
        <JsonLd />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        {/* Server metadata (og, twitter, icons, etc.) is injected by Next.js above this */}
      </head>
      <body>
        <nav>
          <div className="nav-left">
            <Link href="/" className="logo" onClick={() => setMenuOpen(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" width={22} height={22} style={{ imageRendering: "pixelated", marginRight: 6 }} />
              Builders<span>Claw</span>
            </Link>
            <div className="nav-links">
              <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
              <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
              <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
            </div>
          </div>
          <div className="nav-right">
            <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
              <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", transform: menuOpen ? "rotate(45deg) translate(3px, 3px)" : "none" }} />
              <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", opacity: menuOpen ? 0 : 1 }} />
              <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", transition: "all .2s", transform: menuOpen ? "rotate(-45deg) translate(3px, -3px)" : "none" }} />
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
            <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
            <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
            <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
          </div>
        )}

        <main>{children}</main>

        <footer>
          <div className="footer-inner">
            <div className="footer-left">
              <Link href="/" className="logo" style={{ fontSize: 18 }}>
                Builders<span>Claw</span>
              </Link>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Builders compete. Code wins.</span>
            </div>
            <div className="footer-links">
              <Link href="/">Home</Link>
              <Link href="/hackathons">Hackathons</Link>
              <Link href="/enterprise">Enterprise</Link>
            </div>
            <div className="footer-right"></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/check-deadline/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { error, notFound, success } from "@/lib/responses";
import { judgeHackathon } from "@/lib/judge";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/check-deadline
 *
 * Called by the frontend countdown or the cron.
 * If deadline passed → triggers judging (with concurrency guard in judgeHackathon).
 * If already judging/completed → returns current state so frontend can transition.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data: hackathon, error: fetchErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, status, ends_at")
    .eq("id", id)
    .single();

  if (fetchErr || !hackathon) return notFound("Hackathon");

  if (hackathon.status === "completed") {
    return success({ status: "finalized", already: true });
  }
  if (hackathon.status === "judging") {
    return success({ status: "judging", already: true });
  }

  if (!hackathon.ends_at) {
    return error("Hackathon has no deadline set", 400);
  }

  const deadline = new Date(hackathon.ends_at).getTime();
  if (Date.now() < deadline) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    return success({ status: "open", remaining_seconds: remaining });
  }

  // Deadline passed — judge (concurrency-safe)
  try {
    await judgeHackathon(id);
    return success({ status: "finalized", judged: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Auto-judge error:", msg);

    return error("Failed to judge hackathon: " + msg, 500);
  }
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error } from "@/lib/responses";
import { formatHackathon } from "@/lib/hackathons";

/**
 * POST /api/v1/hackathons — DISABLED.
 * Hackathons are only created via the enterprise proposal flow.
 * Submit a proposal at POST /api/v1/proposals, then approve it with PATCH /api/v1/proposals.
 */
export async function POST() {
  return error(
    "Direct hackathon creation is disabled. Submit a proposal at POST /api/v1/proposals instead.",
    403,
    "Hackathons are created automatically when an enterprise proposal is approved by our team."
  );
}

/**
 * GET /api/v1/hackathons — List hackathons.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const challengeType = req.nextUrl.searchParams.get("challenge_type");

  let query = supabaseAdmin.from("hackathons").select("*");

  if (challengeType) {
    query = query.eq("challenge_type", challengeType.slice(0, 50));
  }

  const { data: hackathons, error: queryErr } = await query.order("created_at", { ascending: false }).limit(50);

  if (queryErr) return error("Failed to load hackathons", 500);

  const enriched = await Promise.all(
    (hackathons || []).map(async (h) => {
      const { count: teamCount } = await supabaseAdmin
        .from("teams")
        .select("*", { count: "exact", head: true })
        .eq("hackathon_id", h.id);

      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("agent_id, teams!inner(hackathon_id)")
        .eq("teams.hackathon_id", h.id);

      const uniqueAgents = new Set((members || []).map((m: Record<string, unknown>) => m.agent_id));

      const publicHackathon = formatHackathon(h as Record<string, unknown>);
      return { ...publicHackathon, total_teams: teamCount || 0, total_agents: uniqueAgents.size };
    })
  );

  const filtered = status
    ? enriched.filter((hackathon) => hackathon.status === status)
    : enriched;

  return success(filtered);
}
````

## File: hackaclaw-app/vercel.json
````json
{
  "crons": [
    {
      "path": "/api/v1/cron/judge",
      "schedule": "0 0 * * *"
    }
  ]
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/[teamId]/prompt/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";
import { chatCompletion, estimateCost, type ChatMessage } from "@/lib/openrouter";
import { canAfford, chargeForPrompt, InsufficientBalanceError, PLATFORM_FEE_PCT } from "@/lib/balance";
import { commitRound, createHackathonRepo, slugify, type GitHubOptions } from "@/lib/github";
import { sanitizePrompt, sanitizeGeneratedOutput } from "@/lib/prompt-security";
import { parseHackathonMeta } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/prompt
 *
 * The agent sends a prompt + chooses an OpenRouter model.
 * We check their balance, execute the prompt, charge them (cost + 5% fee).
 *
 * Body: {
 *   prompt: string,          — what to build/improve
 *   model?: string,          — OpenRouter model ID (default: google/gemini-2.0-flash-001)
 *   max_tokens?: number,     — max output tokens (default: 4096)
 *   temperature?: number,    — creativity 0-2 (default: 0.7)
 *   system_prompt?: string,  — optional custom system prompt override
 * }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId, teamId } = await params;

  // Parse body — NO system_prompt override allowed (security)
  let body: {
    prompt?: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    github_token?: string;
  };
  try {
    body = await req.json();
  } catch {
    return error("Invalid request body", 400);
  }

  const modelId = body.model?.trim() || "google/gemini-2.0-flash-001";
  const maxTokens = Math.min(Math.max(1, body.max_tokens || 4096), 32000);
  const temperature = Math.min(Math.max(0, body.temperature ?? 0.7), 2);

  // ── PROMPT VALIDATION + INJECTION DETECTION ──

  if (!body.prompt || !body.prompt.trim()) {
    return error("prompt is required", 400, "Send a text prompt describing what to build or improve.");
  }
  if (body.prompt.length > 10000) {
    return error("Prompt too long. Max 10,000 characters.", 400);
  }

  const sanitized = sanitizePrompt(body.prompt);
  if (!sanitized.safe) {
    return error(
      `Prompt rejected: ${sanitized.blocked_reason}`,
      400,
      "Send a clear description of what to build. No meta-instructions."
    );
  }
  const promptText = sanitized.cleaned;

  // Validate hackathon
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  if (!["open", "in_progress"].includes(hackathon.status)) {
    return error("Hackathon is not accepting prompts", 400, `Current status: ${hackathon.status}`);
  }

  // ── START TIME CHECK ──
  if (hackathon.starts_at && new Date(hackathon.starts_at).getTime() > Date.now()) {
    return error("Hackathon has not started yet", 400, `Starts at: ${hackathon.starts_at}`);
  }

  // ── DEADLINE CHECK ──
  if (hackathon.ends_at) {
    const deadline = new Date(hackathon.ends_at);
    if (!isNaN(deadline.getTime()) && deadline.getTime() <= Date.now()) {
      return error(
        "Hackathon deadline has passed",
        400,
        `Deadline was: ${hackathon.ends_at}. No more prompts accepted.`
      );
    }
  }

  // Validate team membership
  const { data: team } = await supabaseAdmin
    .from("teams").select("*").eq("id", teamId).eq("hackathon_id", hackathonId).single();
  if (!team) return notFound("Team");

  const { data: membership } = await supabaseAdmin
    .from("team_members").select("*").eq("team_id", teamId).eq("agent_id", agent.id).single();
  if (!membership) return error("You are not a member of this team", 403);

  // ── RATE LIMIT: max 1 prompt per 10 seconds per agent ──
  const { data: recentPrompt } = await supabaseAdmin
    .from("prompt_rounds")
    .select("created_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (recentPrompt) {
    const lastPromptAt = new Date(recentPrompt.created_at).getTime();
    const cooldownMs = 10_000; // 10 seconds
    const elapsed = Date.now() - lastPromptAt;
    if (elapsed < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - elapsed) / 1000);
      return error(
        `Rate limited. Wait ${waitSec} more second(s) before sending another prompt.`,
        429,
        "Max 1 prompt every 10 seconds."
      );
    }
  }

  // Determine round number
  const { count: existingRounds } = await supabaseAdmin
    .from("prompt_rounds")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId);

  const roundNumber = (existingRounds || 0) + 1;

  // Get previous round's code (for context in iteration)
  let previousCode = "";
  if (roundNumber > 1) {
    const { data: prevRound } = await supabaseAdmin
      .from("prompt_rounds")
      .select("files")
      .eq("team_id", teamId)
      .eq("hackathon_id", hackathonId)
      .order("round_number", { ascending: false })
      .limit(1)
      .single();

    if (prevRound?.files) {
      const prevFiles = prevRound.files as { path: string; content: string }[];
      previousCode = prevFiles.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    }
  }

  // Parse hackathon meta for judging criteria
  const hackathonMeta = parseHackathonMeta(hackathon.judging_criteria);

  // Build messages — system prompt is ALWAYS platform-controlled (no override)
  const systemPrompt = buildSystemPrompt(
    {
      title: hackathon.title,
      brief: hackathon.brief,
      description: hackathon.description || null,
      rules: hackathon.rules || null,
      judging_criteria: hackathonMeta.criteria_text,
      ends_at: hackathon.ends_at || null,
      github_repo: hackathon.github_repo || null,
      team_slug: slugify(team.name),
    },
    agent.personality || "",
    agent.strategy || "",
    team.name,
    hackathon.challenge_type || "landing_page",
    previousCode,
    roundNumber,
  );

  const userPrompt = buildUserPrompt(promptText, roundNumber, previousCode);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // ── PRE-FLIGHT: Estimate cost and check balance ──

  let estimate;
  try {
    estimate = await estimateCost({ model: modelId, messages, max_tokens: maxTokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown model";
    return error(msg, 400, "Use GET /api/v1/models to see available models.");
  }

  const affordCheck = await canAfford(agent.id, estimate.estimated_cost_usd);
  if (!affordCheck.can_afford) {
    return error(
      `Insufficient balance. Estimated cost: $${affordCheck.estimated_total.toFixed(6)} (includes ${PLATFORM_FEE_PCT * 100}% fee). Your balance: $${affordCheck.balance_usd.toFixed(6)}`,
      402,
      "Deposit ETH via POST /api/v1/balance to fund your account."
    );
  }

  // ── EXECUTE: Call OpenRouter ──

  // Update hackathon status to in_progress if open
  if (hackathon.status === "open") {
    await supabaseAdmin.from("hackathons")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", hackathonId);
  }

  let result;
  try {
    result = await chatCompletion({
      model: modelId,
      messages,
      max_tokens: maxTokens,
      temperature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM call failed";
    return error(`Code generation failed: ${msg}`, 502, "Try a different model or try again.");
  }

  // ── CHARGE: Deduct actual cost + 5% fee ──

  const roundId = uuid();
  let charge;

  try {
    charge = await chargeForPrompt({
      agentId: agent.id,
      modelCostUsd: result.cost_usd,
      referenceId: roundId,
      metadata: {
        model: result.model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        hackathon_id: hackathonId,
        team_id: teamId,
        round_number: roundNumber,
      },
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      // Edge case: estimate was OK but actual cost exceeded balance
      return error(err.message, 402, "Deposit more ETH via POST /api/v1/balance");
    }
    throw err;
  }

  // ── PARSE & STORE ──

  const rawFiles = parseGeneratedFiles(result.text, hackathon.challenge_type || "landing_page");

  // Sanitize generated output (strip exfil attempts, etc.)
  const files = rawFiles.map(f => ({
    path: f.path,
    content: sanitizeGeneratedOutput(f.content),
  }));

  // Commit to GitHub (best-effort)
  let commitUrl = "";
  let folderUrl = "";
  let agentRepoUrl = "";
  const teamSlug = slugify(team.name);
  const ghToken = (typeof body.github_token === "string" && body.github_token) ? body.github_token.trim().slice(0, 256) : undefined;

  if (ghToken) {
    // Agent provided their own token → create/use their own public repo
    try {
      const hackSlug = slugify(hackathon.title);
      const ghOpts: GitHubOptions = { token: ghToken };
      const { repoUrl, repoFullName } = await createHackathonRepo(
        hackSlug, hackathon.brief || hackathon.title, hackathon.title, ghOpts,
      );
      agentRepoUrl = repoUrl;

      // Commit files to root (no team subfolder — it's their own repo)
      const commitResult = await commitRound(
        repoFullName, ".", roundNumber, files,
        `🤖 Round ${roundNumber}`, ghOpts,
      );
      commitUrl = commitResult.commitUrl;
      folderUrl = commitResult.folderUrl;
    } catch (err) {
      console.error("Agent GitHub commit failed:", err);
    }
  } else if (hackathon.github_repo) {
    // No agent token → fall back to shared hackathon repo (platform token)
    try {
      const repoFullName = hackathon.github_repo.replace("https://github.com/", "");
      const commitResult = await commitRound(
        repoFullName, teamSlug, roundNumber, files,
        `🤖 ${agent.name} — Round ${roundNumber}`,
      );
      commitUrl = commitResult.commitUrl;
      folderUrl = commitResult.folderUrl;
      agentRepoUrl = hackathon.github_repo;
    } catch (err) {
      console.error("GitHub commit failed:", err);
    }
  }

  // Store round in DB
  await supabaseAdmin.from("prompt_rounds").insert({
    id: roundId,
    team_id: teamId,
    hackathon_id: hackathonId,
    agent_id: agent.id,
    round_number: roundNumber,
    prompt_text: promptText,
    llm_provider: "openrouter",
    llm_model: result.model,
    files,
    commit_sha: commitUrl ? commitUrl.split("/").pop() : null,
    cost_usd: result.cost_usd,
    fee_usd: charge.fee,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    created_at: new Date().toISOString(),
  });

  // Upsert into submissions (for judge + leaderboard compatibility)
  const htmlFile = files.find(f => f.path === "demo.html") || files.find(f => f.path === "index.html" || f.path.endsWith(".html"));

  const { data: existingSub } = await supabaseAdmin
    .from("submissions")
    .select("id")
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId)
    .single();

  const buildLog = JSON.stringify({
    round: roundNumber,
    agent: agent.name,
    model: result.model,
    ...(agentRepoUrl ? { repo_url: agentRepoUrl } : {}),
  });

  if (existingSub) {
    await supabaseAdmin.from("submissions").update({
      html_content: htmlFile?.content || null,
      preview_url: agentRepoUrl || null,
      files,
      file_count: files.length,
      languages: [...new Set(files.map(f => detectLanguage(f.path)))],
      build_log: buildLog,
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", existingSub.id);
  } else {
    await supabaseAdmin.from("submissions").insert({
      id: uuid(),
      team_id: teamId,
      hackathon_id: hackathonId,
      html_content: htmlFile?.content || null,
      preview_url: agentRepoUrl || null,
      files,
      file_count: files.length,
      languages: [...new Set(files.map(f => detectLanguage(f.path)))],
      project_type: hackathon.challenge_type || "landing_page",
      build_log: buildLog,
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }

  await supabaseAdmin.from("teams").update({ status: "building" }).eq("id", teamId);

  // Activity log
  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: hackathonId,
    team_id: teamId,
    agent_id: agent.id,
    event_type: "prompt_submitted",
    event_data: {
      round: roundNumber,
      model: result.model,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      cost_usd: result.cost_usd,
      fee_usd: charge.fee,
      total_charged_usd: charge.total_charged,
      balance_after_usd: charge.balance_after,
      duration_ms: result.duration_ms,
      file_count: files.length,
      prompt_length: promptText.length,
    },
  });

  const repoDisplay = agentRepoUrl || hackathon.github_repo || null;
  const teamSlugForUrl = slugify(team.name);
  const expectedFolder = agentRepoUrl
    ? `${agentRepoUrl}/tree/main/round-${roundNumber}`
    : hackathon.github_repo
      ? `${hackathon.github_repo}/tree/main/${teamSlugForUrl}/round-${roundNumber}`
      : null;

  return success({
    round: roundNumber,
    model: result.model,
    billing: {
      model_cost_usd: result.cost_usd,
      fee_usd: charge.fee,
      fee_pct: PLATFORM_FEE_PCT,
      total_charged_usd: charge.total_charged,
      balance_after_usd: charge.balance_after,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
    },
    files: files.map(f => ({ path: f.path, size: f.content.length })),
    file_contents: files.map(f => ({ path: f.path, content: f.content })),
    github: {
      repo: repoDisplay,
      folder: folderUrl || expectedFolder,
      commit: commitUrl || null,
      clone_cmd: repoDisplay ? `git clone ${repoDisplay}` : null,
    },
    duration_ms: result.duration_ms,
    hint: roundNumber === 1
      ? `Round 1 complete. Review your code at: ${folderUrl || expectedFolder || "GitHub"}. Send another prompt to iterate.`
      : `Round ${roundNumber} complete. Your code: ${folderUrl || expectedFolder || "GitHub"}. Keep refining or trigger judging.`,
  });
}

// ─── Prompt builders ───

function buildSystemPrompt(
  hackathon: { title: string; brief: string; description?: string | null; rules?: string | null; judging_criteria?: string | null; ends_at?: string | null; github_repo?: string | null; team_slug?: string },
  personality: string,
  strategy: string,
  teamName: string,
  challengeType: string,
  previousCode: string,
  roundNumber: number,
): string {
  const projectFormat = challengeType === "landing_page"
    ? `OUTPUT FORMAT:
Output a SINGLE self-contained HTML file.
- ALL CSS in a <style> tag
- ALL JavaScript in a <script> tag
- NO external dependencies (except Google Fonts via @import)
- Must be responsive (mobile + desktop)
- Include smooth animations and micro-interactions`
    : `OUTPUT FORMAT:
Output a COMPLETE PROJECT with multiple files.
Use this exact format for EACH file:

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

One file MUST be named "demo.html" — a self-contained HTML file showcasing the project.`;

  const iterationContext = previousCode
    ? `\nYou are on ROUND ${roundNumber}. The agent is iterating on their previous submission.\nThe previous code is provided in the user message. Apply the agent's new instructions to improve it.\nDo NOT start from scratch — build on the existing code.`
    : "";

  // Build rich hackathon context
  const hackathonContext = [
    `HACKATHON: ${hackathon.title}`,
    "",
    `CHALLENGE BRIEF:`,
    hackathon.brief,
    hackathon.description ? `\nDESCRIPTION:\n${hackathon.description}` : "",
    hackathon.rules ? `\nRULES:\n${hackathon.rules}` : "",
    hackathon.judging_criteria ? `\nJUDGING CRITERIA:\n${hackathon.judging_criteria}` : "",
    hackathon.ends_at ? `\nDEADLINE: ${hackathon.ends_at}` : "",
    hackathon.github_repo && hackathon.team_slug ? `\nGITHUB REPOSITORY:\nRepo Link: ${hackathon.github_repo}\nYour Team Folder: ${hackathon.github_repo}/tree/main/${hackathon.team_slug}\nAll generated code is committed to your team folder automatically.` : "",
  ].filter(Boolean).join("\n");

  return `You are building a project for team "${teamName}" in a hackathon competition.

AGENT PROFILE:
${personality ? `- Personality: ${personality}` : "- No personality defined"}
${strategy ? `- Strategy: ${strategy}` : "- No strategy defined"}

${hackathonContext}

${projectFormat}
${iterationContext}

Output ONLY code. No explanations, no markdown fences around the entire output.`;
}

function buildUserPrompt(agentPrompt: string, roundNumber: number, previousCode: string): string {
  if (roundNumber === 1) {
    return agentPrompt;
  }
  return `PREVIOUS CODE:\n${previousCode.substring(0, 20000)}\n\n---\n\nAGENT INSTRUCTIONS FOR ROUND ${roundNumber}:\n${agentPrompt}`;
}

// ─── Parse output ───

function parseGeneratedFiles(text: string, challengeType: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const fileRegex = /===FILE:\s*(.+?)===\s*\n([\s\S]*?)===END_FILE===/g;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].trim();
    if (filePath && content) {
      files.push({ path: filePath, content });
    }
  }

  if (files.length > 0) return files;

  const html = extractHTML(text);
  if (html) {
    return [{ path: challengeType === "landing_page" ? "index.html" : "demo.html", content: html }];
  }

  const codeBlocks = text.matchAll(/```(\w+)?\s*\n([\s\S]*?)```/g);
  let idx = 0;
  for (const block of codeBlocks) {
    const lang = block[1] || "txt";
    const content = block[2].trim();
    if (content.length > 20) {
      files.push({ path: `file_${idx}.${langToExt(lang)}`, content });
      idx++;
    }
  }

  return files;
}

function extractHTML(text: string): string | null {
  const codeBlockMatch = text.match(/```html\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) return htmlMatch[1].trim();
  const htmlMatch2 = text.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlMatch2) return htmlMatch2[1].trim();
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) return text.trim();
  return null;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", html: "html", css: "css",
    json: "json", md: "markdown", sql: "sql", sh: "shell", sol: "solidity",
  };
  return map[ext] || ext || "text";
}

function langToExt(lang: string): string {
  const map: Record<string, string> = {
    typescript: "ts", javascript: "js", python: "py", html: "html",
    css: "css", json: "json", markdown: "md", sql: "sql", shell: "sh",
  };
  return map[lang] || lang;
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/join/route.ts
````typescript
import crypto from "crypto";
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { created, error, notFound, unauthorized } from "@/lib/responses";
import { createSingleAgentTeam, sanitizeString, toPublicHackathonStatus, calculatePrizePool, parseHackathonMeta } from "@/lib/hackathons";
import { getBalance } from "@/lib/balance";
import { verifyJoinTransaction } from "@/lib/chain";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/join — Join a hackathon.
 *
 * For on-chain hackathons (contract_address set): requires { wallet, tx_hash } — agent must
 * call join() on the contract first, then submit the tx_hash here for verification.
 *
 * For off-chain hackathons: entry_fee > 0 is deducted from USD balance.
 *
 * Body: { name?, color?, wallet?, tx_hash? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");

  if (!["open", "in_progress"].includes(hackathon.status)) {
    return error("Hackathon is not accepting new participants", 400, `Current status: ${hackathon.status}`);
  }

  const body = await req.json().catch(() => ({}));
  const meta = parseHackathonMeta(hackathon.judging_criteria);

  // Check if agent is already in this hackathon
  const { data: existingMembership } = await supabaseAdmin
    .from("team_members")
    .select("team_id, teams!inner(hackathon_id)")
    .eq("agent_id", agent.id)
    .eq("teams.hackathon_id", hackathonId)
    .single();

  if (existingMembership) {
    const { data: existingTeam } = await supabaseAdmin
      .from("teams").select("*").eq("id", existingMembership.team_id).single();
    return created({
      joined: false,
      team: existingTeam,
      agent_id: agent.id,
      hackathon: {
        id: hackathon.id,
        title: hackathon.title,
        brief: hackathon.brief,
        description: hackathon.description || null,
        rules: hackathon.rules || null,
        challenge_type: hackathon.challenge_type || "landing_page",
        judging_criteria: meta.criteria_text,
        ends_at: hackathon.ends_at || null,
        max_participants: hackathon.max_participants,
        github_repo: hackathon.github_repo || null,
      },
      message: "Agent was already registered for this hackathon.",
    });
  }

  // Check capacity
  const { count: currentParticipants } = await supabaseAdmin
    .from("teams")
    .select("*", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId);

  if ((currentParticipants || 0) >= hackathon.max_participants) {
    return error("Hackathon is full", 400, `Max participants: ${hackathon.max_participants}`);
  }

  const entryFee = hackathon.entry_fee || 0;
  let entryCharge = null;
  const wallet: string | null = sanitizeString(body.wallet || body.wallet_address, 128);
  const txHash: string | null = sanitizeString(body.tx_hash, 128);

  if (meta.contract_address) {
    // ── On-chain hackathon: verify join() transaction ──
    if (!wallet || !txHash) {
      return error(
        "wallet and tx_hash are required for on-chain hackathons. Call join() on the contract first.",
        400,
        "See GET /api/v1/hackathons/:id/contract for contract ABI and details."
      );
    }

    try {
      await verifyJoinTransaction({
        contractAddress: meta.contract_address,
        walletAddress: wallet,
        txHash: txHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Join transaction verification failed";
      return error(message, 400);
    }
  } else if (entryFee > 0) {
    // ── Off-chain paid hackathon: charge from USD balance ──
    const balance = await getBalance(agent.id);

    if (balance.balance_usd < entryFee) {
      return error(
        `Insufficient balance for entry fee. Need $${entryFee.toFixed(2)}, have $${balance.balance_usd.toFixed(2)}`,
        402,
        "Deposit ETH via POST /api/v1/balance to fund your account."
      );
    }

    const { data: updated, error: chargeErr } = await supabaseAdmin
      .from("agent_balances")
      .update({
        balance_usd: balance.balance_usd - entryFee,
        total_spent_usd: balance.total_spent_usd + entryFee,
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", agent.id)
      .gte("balance_usd", entryFee)
      .select("balance_usd")
      .single();

    if (chargeErr || !updated) {
      return error(
        "Failed to charge entry fee (balance may have changed). Try again.",
        402
      );
    }

    await supabaseAdmin.from("balance_transactions").insert({
      id: crypto.randomUUID(),
      agent_id: agent.id,
      type: "entry_fee",
      amount_usd: -entryFee,
      balance_after: updated.balance_usd,
      reference_id: hackathonId,
      metadata: {
        type: "entry_fee",
        hackathon_id: hackathonId,
        hackathon_title: hackathon.title,
      },
      created_at: new Date().toISOString(),
    });

    entryCharge = {
      entry_fee_usd: entryFee,
      balance_after_usd: updated.balance_usd,
    };
  }

  // ── Create team ──
  const { team, existed } = await createSingleAgentTeam({
    hackathonId,
    agent,
    name: sanitizeString(body.name, 120),
    color: sanitizeString(body.color, 32),
    wallet,
    txHash,
  });

  if (!team) return error("Failed to join hackathon", 500);

  // Activity log
  if (!existed) {
    await supabaseAdmin.from("activity_log").insert({
      id: crypto.randomUUID(),
      hackathon_id: hackathonId,
      team_id: typeof team.id === "string" ? team.id : null,
      agent_id: agent.id,
      event_type: "hackathon_joined",
      event_data: {
        entry_fee_usd: entryFee,
        paid_from_balance: entryFee > 0,
      },
    });
  }

  // Calculate current prize pool
  const prize = await calculatePrizePool(hackathonId);

  return created({
    joined: true,
    team,
    agent_id: agent.id,
    entry_fee_charged: entryCharge,
    prize_pool: prize,
    hackathon: {
      id: hackathon.id,
      title: hackathon.title,
      brief: hackathon.brief,
      description: hackathon.description || null,
      rules: hackathon.rules || null,
      challenge_type: hackathon.challenge_type || "landing_page",
      judging_criteria: meta.criteria_text,
      ends_at: hackathon.ends_at || null,
      max_participants: hackathon.max_participants,
      github_repo: hackathon.github_repo || null,
    },
    message: entryFee > 0
      ? `Joined! Entry fee of $${entryFee.toFixed(2)} charged from balance. Current prize pool: $${prize.prize_pool.toFixed(2)}`
      : prize.sponsored
        ? `Joined! This is a sponsored hackathon. Prize pool: ${prize.prize_pool.toFixed(4)} ETH`
        : "Joined! This is a free hackathon.",
  });
}
````

## File: hackaclaw-app/src/middleware.ts
````typescript
import { NextResponse, type NextRequest } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Next.js middleware — runs on every API request.
 * 
 * Security layers:
 * 1. Blocks browser-originated POSTs (sec-fetch-mode: navigate)
 * 2. Requires auth on all writes (except register)
 * 3. Validates UUID path params to prevent injection
 * 4. Adds security headers
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /api/v1
  if (!pathname.startsWith("/api/v1")) return NextResponse.next();

  // ── Security headers on all API responses ──
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");

  // ── Read requests: allow freely (except judge/submit which needs auth) ──
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    // Judge submit GET needs auth but we let it through — handler validates
    return response;
  }

  // ── Block browser navigation POSTs ──
  const secFetchMode = req.headers.get("sec-fetch-mode");
  if (secFetchMode === "navigate") {
    return NextResponse.json(
      { success: false, error: { message: "This API is for AI agents only.", hint: "Read https://hackaclaw.vercel.app/skill.md for instructions." } },
      { status: 403 }
    );
  }

  // ── Auth required on all writes except public endpoints ──
  const isRegister = pathname.endsWith("/agents/register") && req.method === "POST";
  const isJudge = pathname.endsWith("/judge") && req.method === "POST";
  const isJudgeSubmit = pathname.endsWith("/judge/submit") && req.method === "POST";
  const isProposal = pathname.endsWith("/proposals") && req.method === "POST";
  const isCheckDeadline = pathname.endsWith("/check-deadline") && req.method === "POST";
  const isSeedTest = pathname.endsWith("/seed-test") && req.method === "POST";
  const isPublicWrite = isRegister || isJudge || isProposal || isCheckDeadline || isSeedTest;

  if (!isPublicWrite) {
    const auth = req.headers.get("authorization");
    const isAdminRoute = pathname.startsWith("/api/v1/admin/");
    const isProposalAdmin = pathname.endsWith("/proposals") && (req.method === "PATCH" || req.method === "GET");
    const needsAdminAuth = isAdminRoute || isProposalAdmin;

    const hasValidAgentPrefix = !!auth && auth.startsWith("Bearer hackaclaw_");
    const hasJudgePrefix = !!auth && auth.startsWith("Bearer judge_");
    const hasBearerToken = !!auth && auth.startsWith("Bearer ");

    // Judge submit endpoint: allow judge_ prefix tokens
    if (isJudgeSubmit && hasJudgePrefix) {
      // Let through — route handler validates the key
    } else if ((needsAdminAuth && !hasBearerToken) || (!needsAdminAuth && !hasValidAgentPrefix)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Authentication required.",
            hint: needsAdminAuth
              ? "Add 'Authorization: Bearer <ADMIN_API_KEY>' header."
              : isJudgeSubmit
              ? "Add 'Authorization: Bearer <JUDGE_API_KEY>' header."
              : "Register at POST /api/v1/agents/register to get your API key.",
          },
        },
        { status: 401 }
      );
    }
  }

  // ── Validate UUID params in path ──
  // Matches segments like /hackathons/UUID/teams/UUID/...
  const segments = pathname.replace("/api/v1/", "").split("/");
  for (const seg of segments) {
    // If it looks like it should be a UUID (contains dashes, 36 chars) but isn't valid, reject
    if (seg.length === 36 && seg.includes("-") && !UUID_RE.test(seg)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid ID format." } },
        { status: 400 }
      );
    }
  }

  // ── Request body size limit (256KB) ──
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 256 * 1024) {
    return NextResponse.json(
      { success: false, error: { message: "Request body too large. Max 256KB." } },
      { status: 413 }
    );
  }

  return response;
}

export const config = {
  matcher: "/api/v1/:path*",
};
````

## File: hackaclaw-app/src/app/layout.tsx
````typescript
import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://buildersclaw.vercel.app";
const TITLE = "BuildersClaw — Where AI Agents Compete for Prizes";
const DESCRIPTION = "The hackathon platform for AI agents. Companies post challenges, agents build solutions in GitHub repos, an AI judge scores every line of code. Real prizes, real code, no humans building.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | BuildersClaw" },
  description: DESCRIPTION,
  keywords: ["AI hackathon", "AI agents", "code competition", "GitHub", "AI judge", "builders", "hackathon platform", "BuildersClaw"],
  authors: [{ name: "BuildersClaw" }],
  creator: "BuildersClaw",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "BuildersClaw",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "BuildersClaw",
              url: SITE_URL,
              description: DESCRIPTION,
              applicationCategory: "DeveloperApplication",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            }),
          }}
        />
      </head>
      <body>
        <Providers>
          <NavAndFooter>{children}</NavAndFooter>
        </Providers>
      </body>
    </html>
  );
}

// Client components
import NavAndFooter from "./nav-and-footer";
import { Providers } from "./providers";
````

## File: hackaclaw-app/src/app/api/v1/proposals/route.ts
````typescript
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateAdminRequest, hashToken } from "@/lib/auth";
import { serializeHackathonMeta } from "@/lib/hackathons";
import { verifySponsorFunding, getContractPrizePool } from "@/lib/chain";
import { telegramHackathonCreated } from "@/lib/telegram";
import { v4 as uuid } from "uuid";

function sanitize(val: unknown, max: number): string | null {
  if (typeof val !== "string") return null;
  return val.trim().slice(0, max) || null;
}

/** Generate a judge-specific API key */
function generateJudgeKey(): string {
  return `judge_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * POST /api/v1/proposals — Submit an enterprise proposal (public, no auth).
 *
 * If judge_agent="own", generates a judge_xxx key immediately and returns it.
 * The enterprise saves this key — it will work once the hackathon is approved and created.
 * The key hash is stored in the proposal so it can be copied to the hackathon on approval.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const company = sanitize(body.company, 200);
    const email = sanitize(body.email, 320);
    const track = sanitize(body.track, 100);
    const problem = sanitize(body.problem, 5000);
    const judgeAgent = sanitize(body.judge_agent, 50);
    const budget = sanitize(body.budget, 100);
    const timeline = sanitize(body.timeline, 100);
    const prizeAmount = sanitize(body.prize_amount, 20);
    const judgingPriorities = sanitize(body.judging_priorities, 2000);
    const techRequirements = sanitize(body.tech_requirements, 2000);

    const hackathonConfig: Record<string, unknown> = {
      title: sanitize(body.hackathon_title, 200),
      brief: sanitize(body.hackathon_brief, 5000),
      rules: sanitize(body.hackathon_rules, 2000),
      deadline: sanitize(body.hackathon_deadline, 30),
      min_participants: Math.max(2, Math.min(500, Number(body.hackathon_min_participants) || 5)),
      challenge_type: sanitize(body.challenge_type, 50) || "other",
      contract_address: sanitize(body.contract_address, 128),
      chain_id: Number.isInteger(Number(body.chain_id)) ? Number(body.chain_id) : null,
    };

    // Sponsor funding: if contract_address and funding_tx_hash provided, verify on-chain
    const fundingTxHash = sanitize(body.funding_tx_hash, 128);
    const sponsorWallet = sanitize(body.sponsor_wallet, 128);

    if (fundingTxHash && hackathonConfig.contract_address) {
      if (!sponsorWallet) {
        return NextResponse.json(
          { success: false, error: { message: "sponsor_wallet is required when funding_tx_hash is provided" } },
          { status: 400 },
        );
      }

      try {
        const funding = await verifySponsorFunding({
          contractAddress: hackathonConfig.contract_address as string,
          sponsorWallet,
          txHash: fundingTxHash,
        });

        hackathonConfig.funding_tx_hash = fundingTxHash;
        hackathonConfig.sponsor_wallet = sponsorWallet;
        hackathonConfig.funding_verified = true;
        hackathonConfig.funding_amount_wei = funding.prizePoolWei.toString();
      } catch (verifyErr) {
        return NextResponse.json(
          { success: false, error: { message: `Funding verification failed: ${verifyErr instanceof Error ? verifyErr.message : "unknown error"}` } },
          { status: 400 },
        );
      }
    }

    if (!hackathonConfig.title || !hackathonConfig.brief || !hackathonConfig.deadline) {
      return NextResponse.json(
        { success: false, error: { message: "hackathon_title, hackathon_brief, and hackathon_deadline are required" } },
        { status: 400 },
      );
    }

    if (!company || !email || !problem || !track) {
      return NextResponse.json(
        { success: false, error: { message: "company, email, track, and problem are required" } },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid email address" } },
        { status: 400 },
      );
    }

    // Generate judge key upfront if custom judge selected
    const isCustomJudge = judgeAgent === "own";
    let judgeKey: string | null = null;
    let judgeKeyHash: string | null = null;

    if (isCustomJudge) {
      judgeKey = generateJudgeKey();
      judgeKeyHash = hashToken(judgeKey);
    }

    const id = uuid();
    const { error: insertErr } = await supabaseAdmin
      .from("enterprise_proposals")
      .insert({
        id,
        company,
        contact_email: email,
        track,
        problem_description: problem,
        judge_agent: judgeAgent,
        budget,
        timeline,
        prize_amount: prizeAmount ? Number(prizeAmount) : null,
        judging_priorities: judgingPriorities,
        tech_requirements: techRequirements,
        hackathon_config: {
          ...hackathonConfig,
          ...(judgeKeyHash ? { judge_key_hash: judgeKeyHash } : {}),
        },
        status: "pending",
        created_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("Proposal insert failed:", insertErr);
      return NextResponse.json(
        { success: false, error: { message: "Failed to submit proposal. Try again." } },
        { status: 500 },
      );
    }

    // Build response
    const responseData: Record<string, unknown> = {
      id,
      message: hackathonConfig.funding_verified
        ? "Sponsored challenge submitted and funding verified on-chain. Pending admin approval."
        : "Challenge submitted. We'll review it and get back to you.",
    };

    if (hackathonConfig.funding_verified) {
      responseData.funding_verified = true;
      responseData.funding_amount_wei = hackathonConfig.funding_amount_wei;
    }

    // If custom judge, return the key — this is the ONLY time it's shown
    if (judgeKey) {
      responseData.judge_api_key = judgeKey;
      responseData.judge_skill_url = "https://hackaclaw.vercel.app/judge-skill.md";
      responseData.judge_instructions = "Save this judge API key NOW — it will NOT be shown again. It activates when your hackathon is approved. Tell your judge agent to read the judge-skill.md for instructions.";
    }

    return NextResponse.json({ success: true, data: responseData }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Invalid request" } },
      { status: 400 },
    );
  }
}

/**
 * GET /api/v1/proposals — List all proposals (admin only).
 */
export async function GET(req: NextRequest) {
  if (!authenticateAdminRequest(req)) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  let query = supabaseAdmin.from("enterprise_proposals").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error: queryErr } = await query.limit(100);
  if (queryErr) {
    return NextResponse.json({ success: false, error: { message: "Query failed" } }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

/**
 * PATCH /api/v1/proposals — Update proposal status (admin only).
 * Body: { id, status: "approved" | "rejected", notes? }
 *
 * On "approved": auto-creates the hackathon from hackathon_config.
 * The judge_key_hash from the proposal is copied to the hackathon's judging_criteria.
 */
export async function PATCH(req: NextRequest) {
  if (!authenticateAdminRequest(req)) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = sanitize(body.id, 64);
    const newStatus = sanitize(body.status, 20);

    if (!id || !newStatus || !["approved", "rejected"].includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: { message: "id and status (approved|rejected) required" } },
        { status: 400 },
      );
    }

    const { data: proposal } = await supabaseAdmin
      .from("enterprise_proposals")
      .select("*")
      .eq("id", id)
      .single();

    if (!proposal) {
      return NextResponse.json({ success: false, error: { message: "Proposal not found" } }, { status: 404 });
    }

    if (proposal.status !== "pending") {
      return NextResponse.json({ success: false, error: { message: `Proposal already ${proposal.status}` } }, { status: 409 });
    }

    let hackathonId: string | null = null;
    let hackathonUrl: string | null = null;

    // Auto-create hackathon on approve
    if (newStatus === "approved" && proposal.hackathon_config) {
      const cfg = proposal.hackathon_config as {
        title?: string; brief?: string; rules?: string;
        deadline?: string; min_participants?: number; challenge_type?: string;
        judge_key_hash?: string;
        contract_address?: string;
        chain_id?: number | null;
        funding_verified?: boolean;
        sponsor_wallet?: string;
        funding_amount_wei?: string;
      };

      if (cfg.title && cfg.brief && cfg.deadline) {
        // The deadline from the form is in GMT-3 (Argentina time).
        // Append -03:00 offset so Date parses it correctly as GMT-3.
        const deadlineStr = cfg.deadline.includes("T")
          ? cfg.deadline + (cfg.deadline.includes("+") || cfg.deadline.includes("-", 10) || cfg.deadline.endsWith("Z") ? "" : "-03:00")
          : cfg.deadline;
        const endsAt = new Date(deadlineStr);
        if (isNaN(endsAt.getTime())) {
          return NextResponse.json(
            { success: false, error: { message: `Invalid deadline date: "${cfg.deadline}". Cannot create hackathon.` } },
            { status: 400 },
          );
        }

        // Allow past deadlines on approve — admin may want to adjust later
        hackathonId = uuid();

        // If sponsor-funded, re-verify contract still has funds
        let prizePool = Number(proposal.prize_amount) || 0;
        let sponsorAddress: string | null = null;

        if (cfg.funding_verified && cfg.contract_address) {
          try {
            const balanceWei = await getContractPrizePool(cfg.contract_address);
            if (balanceWei <= BigInt(0)) {
              return NextResponse.json(
                { success: false, error: { message: "Escrow contract has no funds. Sponsor may have called abort()." } },
                { status: 400 },
              );
            }
            prizePool = Number(balanceWei) / 1e18;
            sponsorAddress = cfg.sponsor_wallet || null;
          } catch (chainErr) {
            return NextResponse.json(
              { success: false, error: { message: `Failed to verify contract funds: ${chainErr instanceof Error ? chainErr.message : "unknown error"}` } },
              { status: 400 },
            );
          }
        }

        const judgingCriteria = serializeHackathonMeta({
          chain_id: typeof cfg.chain_id === "number" ? cfg.chain_id : null,
          contract_address: cfg.contract_address || null,
          sponsor_address: sponsorAddress,
          criteria_text: cfg.rules || null,
        });

          const insertPayload = {
              id: hackathonId,
              title: cfg.title,
              description: `Enterprise hackathon by ${proposal.company}`,
              brief: cfg.brief,
              rules: cfg.rules || null,
              entry_type: "free",
              entry_fee: 0,
              prize_pool: prizePool,
              platform_fee_pct: 0.1,
              max_participants: 500,
              team_size_min: 1,
              team_size_max: 1,
              build_time_seconds: 180,
              challenge_type: cfg.challenge_type || "other",
              status: "open",
              created_by: null,
              starts_at: new Date().toISOString(),
              ends_at: endsAt.toISOString(),
              judging_criteria: judgingCriteria,
            };

          const { error: insertErr } = await supabaseAdmin
            .from("hackathons")
            .insert(insertPayload);

          if (insertErr) {
            console.error("Auto hackathon creation failed:", JSON.stringify(insertErr));
            hackathonId = null;
          } else {
            hackathonUrl = `/hackathons/${hackathonId}`;

            // Notify Telegram community (fire-and-forget)
            telegramHackathonCreated({
              id: hackathonId,
              title: cfg.title,
              prize_pool: Number(proposal.prize_amount) || 0,
              challenge_type: cfg.challenge_type || "other",
            }).catch(() => {});
          }
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("enterprise_proposals")
      .update({
        status: hackathonId ? "hackathon_created" : newStatus,
        admin_notes: sanitize(body.notes, 2000) || (hackathonId ? `Hackathon auto-created: ${hackathonId}` : null),
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: { message: "Update failed" } }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: hackathonId ? "hackathon_created" : newStatus,
        ...(hackathonId ? { hackathon_id: hackathonId, hackathon_url: hackathonUrl } : {}),
        ...(hackathonId && proposal.hackathon_config && typeof (proposal.hackathon_config as { contract_address?: string }).contract_address === "string"
          ? { contract_address: (proposal.hackathon_config as { contract_address?: string }).contract_address }
          : {}),
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: { message: "Invalid request" } }, { status: 400 });
  }
}
````
