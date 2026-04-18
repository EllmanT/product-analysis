<?php

declare(strict_types=1);

test('api health returns ok', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertJsonPath('status', 'ok')
        ->assertJsonStructure(['status', 'timestamp']);
});
