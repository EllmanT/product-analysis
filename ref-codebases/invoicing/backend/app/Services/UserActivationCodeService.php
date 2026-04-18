<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use App\Models\UserActivationCode;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class UserActivationCodeService
{
    private const CODE_LENGTH = 6;

    /** Uppercase letters and digits excluding ambiguous 0/O, 1/I/L */
    private const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    public function normalize(string $code): string
    {
        return strtoupper(preg_replace('/\s+/', '', trim($code)) ?? '');
    }

    public function hash(string $normalizedCode): string
    {
        return hash_hmac('sha256', $normalizedCode, (string) config('app.key'));
    }

    /**
     * Generate a new random 6-character code (may retry if hash collision).
     */
    public function generatePlainCode(): string
    {
        $max = strlen(self::CHARSET) - 1;
        $out = '';
        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $out .= self::CHARSET[random_int(0, $max)];
        }

        return $out;
    }

    /**
     * Revoke existing active codes and create a new one. Returns plaintext once.
     */
    public function issueForUser(User $user): string
    {
        $this->assertUserMayHaveActivationCode($user);

        return DB::transaction(function () use ($user): string {
            UserActivationCode::query()
                ->where('user_id', $user->id)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            for ($attempt = 0; $attempt < 25; $attempt++) {
                $plain = $this->generatePlainCode();
                $normalized = $this->normalize($plain);
                $hash = $this->hash($normalized);

                if (UserActivationCode::query()->where('code_hash', $hash)->exists()) {
                    continue;
                }

                UserActivationCode::query()->create([
                    'user_id' => $user->id,
                    'code_hash' => $hash,
                    'code_hint' => substr($normalized, -2),
                ]);

                return $plain;
            }

            throw new RuntimeException('Could not generate a unique activation code.');
        });
    }

    public function findActiveByPlainCode(string $plain): ?UserActivationCode
    {
        $normalized = $this->normalize($plain);
        if (strlen($normalized) !== self::CODE_LENGTH) {
            return null;
        }

        $hash = $this->hash($normalized);

        return UserActivationCode::query()
            ->where('code_hash', $hash)
            ->whereNull('revoked_at')
            ->with('user')
            ->first();
    }

    public function touchLastUsed(UserActivationCode $code): void
    {
        $code->update(['last_used_at' => now()]);
    }

    /**
     * Masked status for API (never exposes full code).
     *
     * @return array{has_code: bool, hint: string|null, updated_at: string|null}
     */
    public function statusForUser(User $user): array
    {
        $this->assertUserMayHaveActivationCode($user);

        $row = UserActivationCode::query()
            ->where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->latest('created_at')
            ->first();

        if ($row === null) {
            return [
                'has_code' => false,
                'hint' => null,
                'updated_at' => null,
            ];
        }

        return [
            'has_code' => true,
            'hint' => $row->code_hint,
            'updated_at' => $row->updated_at?->toIso8601String(),
        ];
    }

    public function assertUserMayHaveActivationCode(User $user): void
    {
        if ($user->role === 'SUPER_ADMIN') {
            throw new RuntimeException('Super admin accounts cannot use activation codes.');
        }
        if ($user->company_id === null || $user->company_id === '') {
            throw new RuntimeException('User must belong to a company.');
        }
    }
}
