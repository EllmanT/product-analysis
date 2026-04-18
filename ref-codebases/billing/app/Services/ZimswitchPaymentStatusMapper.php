<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Collection;

/**
 * Classifies OPPWA Copy & Pay {@see https://hyperpay.docs.oppwa.com/} result codes using the same regex
 * buckets as the legacy ZimSwitch integration.
 */
final class ZimswitchPaymentStatusMapper
{
    private Collection $codes;

    private const SUCCESS_PATTERN = '/^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.[1][12]0)/';

    private const SUCCESS_REVIEW_PATTERN = '/^(000\.400\.0[^3]|000\.400\.100)/';

    private const PENDING_SHORT_PATTERN = '/^(000\.200)/';

    private const PENDING_DELAYED_PATTERN = '/^(800\.400\.5|100\.400\.500)/';

    private const REJECTED_3DS_PATTERN = '/^(000\.400\.[1][0-9][1-9]|000\.400\.2)/';

    private const REJECTED_BANK_PATTERN = '/^(800\.[17]00|800\.800\.[123])/';

    private const REJECTED_COMMUNICATION_PATTERN = '/^(900\.[1234]00|000\.400\.030)/';

    private const REJECTED_SYSTEM_PATTERN = '/^(800\.[56]|999\.|600\.1|800\.800\.[84])/';

    private const REJECTED_ASYNC_PATTERN = '/^(100\.39[765])/';

    private const SOFT_DECLINE_PATTERN = '/^(300\.100\.100)/';

    public function __construct()
    {
        $path = config('zimswitch.result_codes_path');
        $this->codes = collect();

        if (is_string($path) && is_readable($path)) {
            $json = file_get_contents($path);
            if ($json !== false) {
                /** @var array{resultCodes?: list<array{code: string, description?: string}>} $data */
                $data = json_decode($json, true) ?? [];
                $this->codes = collect($data['resultCodes'] ?? []);
            }
        }
    }

    public function getDescription(string $code): string
    {
        $row = $this->codes->firstWhere('code', $code);

        return is_array($row) ? (string) ($row['description'] ?? 'Unknown status code') : 'Unknown status code';
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function getAll(): Collection
    {
        return $this->codes;
    }

    public function isSuccess(string $code): bool
    {
        return (bool) preg_match(self::SUCCESS_PATTERN, $code);
    }

    public function isSuccessWithReview(string $code): bool
    {
        return (bool) preg_match(self::SUCCESS_REVIEW_PATTERN, $code);
    }

    public function isPending(string $code): bool
    {
        return (bool) preg_match(self::PENDING_SHORT_PATTERN, $code);
    }

    public function isPendingDelayed(string $code): bool
    {
        return (bool) preg_match(self::PENDING_DELAYED_PATTERN, $code);
    }

    public function isAnyPending(string $code): bool
    {
        return $this->isPending($code) || $this->isPendingDelayed($code);
    }

    public function isRejected(string $code): bool
    {
        return $this->isRejected3DS($code)
            || $this->isRejectedBank($code)
            || $this->isRejectedCommunication($code)
            || $this->isRejectedSystem($code)
            || $this->isRejectedAsync($code)
            || $this->isSoftDecline($code);
    }

    public function isRejected3DS(string $code): bool
    {
        return (bool) preg_match(self::REJECTED_3DS_PATTERN, $code);
    }

    public function isRejectedBank(string $code): bool
    {
        return (bool) preg_match(self::REJECTED_BANK_PATTERN, $code);
    }

    public function isRejectedCommunication(string $code): bool
    {
        return (bool) preg_match(self::REJECTED_COMMUNICATION_PATTERN, $code);
    }

    public function isRejectedSystem(string $code): bool
    {
        return (bool) preg_match(self::REJECTED_SYSTEM_PATTERN, $code);
    }

    public function isRejectedAsync(string $code): bool
    {
        return (bool) preg_match(self::REJECTED_ASYNC_PATTERN, $code);
    }

    public function isSoftDecline(string $code): bool
    {
        return (bool) preg_match(self::SOFT_DECLINE_PATTERN, $code);
    }

    /**
     * @return 'success'|'success_review'|'pending'|'pending_delayed'|'rejected'|'unknown'
     */
    public function getStatusCategory(string $code): string
    {
        if ($this->isSuccess($code)) {
            return 'success';
        }

        if ($this->isSuccessWithReview($code)) {
            return 'success_review';
        }

        if ($this->isPending($code)) {
            return 'pending';
        }

        if ($this->isPendingDelayed($code)) {
            return 'pending_delayed';
        }

        if ($this->isRejected($code)) {
            return 'rejected';
        }

        return 'unknown';
    }

    public function getStatusSummary(string $code): string
    {
        $category = $this->getStatusCategory($code);
        $description = $this->getDescription($code);

        $summary = match ($category) {
            'success' => 'Transaction succeeded',
            'success_review' => 'Transaction succeeded but requires manual review',
            'pending' => 'Transaction pending',
            'pending_delayed' => 'Transaction pending (delayed finalization)',
            'rejected' => 'Transaction rejected',
            default => 'Unknown status',
        };

        return "{$summary}: {$description}";
    }
}
