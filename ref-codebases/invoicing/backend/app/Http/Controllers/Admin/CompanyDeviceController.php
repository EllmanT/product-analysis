<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ResolvesAdminTableQuery;
use App\Http\Controllers\Controller;
use App\Jobs\ActivateFiscalCloudDeviceJob;
use App\Models\CompanyDevice;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

final class CompanyDeviceController extends Controller
{
    use ResolvesAdminTableQuery;

    public function index(Request $request): Response
    {
        ['per_page' => $perPage, 'q' => $q] = $this->tableParams($request);
        $status = trim((string) $request->query('status', ''));

        $devices = CompanyDevice::query()
            ->with(['company:id,legal_name,trade_name,tin'])
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.addcslashes($q, '%_\\').'%';
                $query->where(function ($w) use ($like): void {
                    $w->where('device_name', 'like', $like)
                        ->orWhere('device_serial_no', 'like', $like)
                        ->orWhere('fiscal_device_id', 'like', $like)
                        ->orWhere('zimra_device_id', 'like', $like)
                        ->orWhereHas('company', function ($c) use ($like): void {
                            $c->where('legal_name', 'like', $like)
                                ->orWhere('trade_name', 'like', $like)
                                ->orWhere('tin', 'like', $like);
                        });
                });
            })
            ->when($status !== '', function ($query) use ($status): void {
                $query->where('activation_status', mb_strtoupper($status));
            })
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('Admin/Devices/Index', [
            'devices' => $devices,
            'filters' => [
                'q' => $q,
                'per_page' => $perPage,
                'status' => $status,
            ],
        ]);
    }

    public function show(CompanyDevice $device): Response
    {
        $device->load(['company:id,legal_name,trade_name,tin,vat_number,email,phone']);

        return Inertia::render('Admin/Devices/Show', [
            'device' => $device,
        ]);
    }

    public function retryActivation(CompanyDevice $device): RedirectResponse
    {
        if ($device->fiscal_cloud_activated_at !== null || mb_strtoupper((string) $device->activation_status) === 'ACTIVATED') {
            return back()->with('error', 'Device is already activated.');
        }

        $environment = is_string($device->zimra_environment) && $device->zimra_environment !== '' ? $device->zimra_environment : 'test';

        DB::transaction(function () use ($device, $environment): void {
            $device->forceFill([
                'activation_status' => 'PENDING',
                'activation_error' => null,
            ])->save();

            ActivateFiscalCloudDeviceJob::dispatch((string) $device->id, $environment)->afterCommit();
        });

        return back()->with('success', 'Activation retry queued.');
    }
}

