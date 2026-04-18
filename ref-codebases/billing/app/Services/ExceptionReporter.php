<?php

declare(strict_types=1);

namespace App\Services;

use Sentry\State\Scope;
use Throwable;

final class ExceptionReporter
{
    /**
     * Report a handled exception to Sentry (and keep normal app flow).
     *
     * @param  array<string, mixed>  $context
     */
    public function report(Throwable $e, array $context = []): void
    {
        if (! function_exists('\Sentry\captureException')) {
            return;
        }

        \Sentry\withScope(function (Scope $scope) use ($context, $e): void {
            foreach ($context as $key => $value) {
                $scope->setContext((string) $key, is_array($value) ? $value : ['value' => $value]);
            }

            \Sentry\captureException($e);
        });
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function message(string $message, array $context = []): void
    {
        if (! function_exists('\Sentry\captureMessage')) {
            return;
        }

        \Sentry\withScope(function (Scope $scope) use ($context, $message): void {
            foreach ($context as $key => $value) {
                $scope->setContext((string) $key, is_array($value) ? $value : ['value' => $value]);
            }

            \Sentry\captureMessage($message);
        });
    }
}
