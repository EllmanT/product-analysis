<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

final class LegalController extends Controller
{
    public function privacyPolicy(): Response
    {
        return Inertia::render('legal/PrivacyPolicy');
    }

    public function terms(): Response
    {
        return Inertia::render('legal/Terms');
    }
}
