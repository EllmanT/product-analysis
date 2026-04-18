<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{ config('app.name', 'E-Invoicing') }}</title>
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600,700" rel="stylesheet" />
        @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
            @vite(['resources/css/app.css', 'resources/js/welcome.js'])
        @endif
        <style>
            :root {
                --ei-bg: #fafafa;
                --ei-surface: #ffffff;
                --ei-text: #1a1a1a;
                --ei-muted: #5c5c5c;
                --ei-accent: #e11d48;
                --ei-accent-hover: #be123c;
                --ei-border: #e8e8e8;
            }
            * { box-sizing: border-box; }
            body {
                margin: 0;
                min-height: 100vh;
                font-family: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif;
                background: var(--ei-bg);
                color: var(--ei-text);
                -webkit-font-smoothing: antialiased;
            }
            .wrap { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
            header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1.25rem 0;
                border-bottom: 1px solid var(--ei-border);
            }
            .logo {
                font-weight: 700;
                font-size: 1.125rem;
                letter-spacing: -0.02em;
                color: var(--ei-text);
                text-decoration: none;
            }
            .logo span { color: var(--ei-accent); }
            .nav-link {
                font-size: 0.875rem;
                font-weight: 500;
                color: var(--ei-muted);
                text-decoration: none;
            }
            .nav-link:hover { color: var(--ei-accent); }
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.625rem 1.25rem;
                font-size: 0.875rem;
                font-weight: 600;
                border-radius: 0.5rem;
                text-decoration: none;
                transition: background 0.15s ease, color 0.15s ease;
            }
            .btn-primary {
                background: var(--ei-accent);
                color: #fff;
                border: none;
                cursor: pointer;
            }
            .btn-primary:hover { background: var(--ei-accent-hover); }
            .btn-ghost {
                background: transparent;
                color: var(--ei-muted);
                border: 1px solid var(--ei-border);
            }
            .btn-ghost:hover {
                border-color: var(--ei-accent);
                color: var(--ei-accent);
            }
            .hero {
                padding: 4rem 0 3rem;
                text-align: center;
            }
            @media (min-width: 768px) {
                .hero { padding: 5rem 0 4rem; }
            }
            .eyebrow {
                display: inline-block;
                font-size: 0.75rem;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--ei-accent);
                margin-bottom: 1rem;
            }
            h1 {
                font-size: clamp(1.875rem, 4vw, 2.75rem);
                font-weight: 700;
                letter-spacing: -0.03em;
                line-height: 1.15;
                max-width: 36rem;
                margin: 0 auto 1rem;
            }
            .lead {
                font-size: 1.0625rem;
                line-height: 1.6;
                color: var(--ei-muted);
                max-width: 32rem;
                margin: 0 auto 2rem;
            }
            .hero-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 0.75rem;
                justify-content: center;
            }
            .cards {
                display: grid;
                gap: 1rem;
                padding: 2rem 0 4rem;
            }
            @media (min-width: 640px) {
                .cards { grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
            }
            .card {
                background: var(--ei-surface);
                border: 1px solid var(--ei-border);
                border-radius: 0.75rem;
                padding: 1.5rem;
                text-align: left;
            }
            .card h3 {
                font-size: 1rem;
                font-weight: 600;
                margin: 0 0 0.5rem;
            }
            .card p {
                margin: 0;
                font-size: 0.875rem;
                line-height: 1.5;
                color: var(--ei-muted);
            }
            .card-icon {
                width: 2.5rem;
                height: 2.5rem;
                border-radius: 0.5rem;
                background: #fff1f2;
                color: var(--ei-accent);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.125rem;
                margin-bottom: 1rem;
            }
            footer {
                padding: 2rem 0;
                border-top: 1px solid var(--ei-border);
                text-align: center;
                font-size: 0.8125rem;
                color: var(--ei-muted);
            }
        </style>
    </head>
    <body>
        <div class="wrap">
            <header>
                <a href="{{ url('/') }}" class="logo">Axis <span>E-Invoicing</span></a>
                <nav style="display: flex; align-items: center; gap: 1rem;">
                    @auth
                        @if(auth()->user()->role === 'SUPER_ADMIN')
                            <a href="{{ url('/admin/dashboard') }}" class="nav-link">Admin dashboard</a>
                        @endif
                    @else
                        @if(Route::has('admin.login'))
                            <a href="{{ route('admin.login') }}" class="btn btn-primary">Admin sign in</a>
                        @endif
                    @endauth
                </nav>
            </header>

            <section class="hero">
                <span class="eyebrow">Fiscal-ready invoicing</span>
                <h1>Billing infrastructure for compliant receipts</h1>
                <p class="lead">
                    Create and manage fiscal invoices, buyers, and products — with a dedicated admin workspace for your team.
                </p>
                <div class="hero-actions">
                    @if(Route::has('admin.login'))
                        <a href="{{ route('admin.login') }}" class="btn btn-primary">Go to admin</a>
                    @endif
                    <a href="https://laravel.com/docs" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">Laravel docs</a>
                </div>
            </section>

            <section class="cards" aria-label="Features">
                <article class="card">
                    <div class="card-icon" aria-hidden="true">📄</div>
                    <h3>Invoices &amp; fiscalization</h3>
                    <p>Issue invoices and credit notes aligned with your fiscal device workflow.</p>
                </article>
                <article class="card">
                    <div class="card-icon" aria-hidden="true">🏢</div>
                    <h3>Multi-tenant companies</h3>
                    <p>Isolate data per company with users, products, and buyers in one place.</p>
                </article>
                <article class="card">
                    <div class="card-icon" aria-hidden="true">📊</div>
                    <h3>Admin overview</h3>
                    <p>Super admins get a full picture of usage, settings, and system configuration.</p>
                </article>
            </section>
        </div>

        <footer>
            <div class="wrap">
                © {{ date('Y') }} {{ config('app.name', 'E-Invoicing') }}. All rights reserved.
            </div>
        </footer>
    </body>
</html>
