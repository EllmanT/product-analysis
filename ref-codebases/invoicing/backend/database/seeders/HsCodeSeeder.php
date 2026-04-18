<?php

namespace Database\Seeders;

use App\Models\HsCode;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class HsCodeSeeder extends Seeder
{
    private const BATCH_SIZE = 300;

    /**
     * Seed HS codes from database/HSCodes.csv.
     * All rows are active and treated as goods (not services).
     */
    public function run(): void
    {
        $path = database_path('HSCodes.csv');

        if (! is_readable($path)) {
            $this->command?->error("Cannot read HSCodes.csv at {$path}");

            return;
        }

        $handle = fopen($path, 'r');
        if ($handle === false) {
            $this->command?->error('Failed to open HSCodes.csv');

            return;
        }

        $header = fgetcsv($handle);
        if ($header === false) {
            fclose($handle);
            $this->command?->error('HSCodes.csv is empty');

            return;
        }

        $batch = [];
        while (($row = fgetcsv($handle)) !== false) {
            $code = isset($row[0]) ? trim((string) $row[0]) : '';
            if ($code === '') {
                continue;
            }

            $description = isset($row[1]) ? trim((string) $row[1]) : '';

            $batch[] = [
                'code' => $code,
                'description' => $description,
            ];

            if (count($batch) >= self::BATCH_SIZE) {
                $this->flushBatch($batch);
                $batch = [];
            }
        }

        fclose($handle);

        if ($batch !== []) {
            $this->flushBatch($batch);
        }

        $this->command?->info('HS codes seeded from HSCodes.csv.');
    }

    /**
     * @param  array<int, array{code: string, description: string}>  $batch
     */
    private function flushBatch(array $batch): void
    {
        DB::transaction(function () use ($batch): void {
            foreach ($batch as $row) {
                HsCode::updateOrCreate(
                    ['code' => $row['code']],
                    [
                        'description' => $row['description'],
                        'category' => null,
                        'is_service' => false,
                        'default_tax_code' => null,
                        'is_active' => true,
                    ]
                );
            }
        });
    }
}
