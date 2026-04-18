<?php

namespace Database\Seeders;

use App\Models\TaxRate;
use Illuminate\Database\Seeder;

class TaxRateSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            ['code' => 'A', 'label' => 'Tax A', 'percent' => 15.5, 'sort_order' => 1],
            ['code' => 'B', 'label' => 'Tax B', 'percent' => 0, 'sort_order' => 2],
        ];

        foreach ($rows as $row) {
            TaxRate::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'label' => $row['label'],
                    'percent' => $row['percent'],
                    'sort_order' => $row['sort_order'],
                ]
            );
        }

        TaxRate::query()->whereNotIn('code', ['A', 'B'])->delete();
    }
}
