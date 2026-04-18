<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\Api\StoreCustomerData;
use App\Data\Api\UpdateCustomerData;
use App\Data\CustomerDto;
use App\Models\Customer;
use App\Repositories\Interfaces\CustomerRepositoryInterface;
use Illuminate\Support\Collection;

final class CustomerService
{
    public function __construct(
        private readonly CustomerRepositoryInterface $customers,
    ) {}

    /**
     * @return Collection<int, CustomerDto>
     */
    public function listCustomers(): Collection
    {
        return $this->customers->all()->map(
            fn (Customer $customer): CustomerDto => CustomerDto::fromCustomer($customer)
        );
    }

    public function getCustomer(Customer $customer): CustomerDto
    {
        return CustomerDto::fromCustomer($customer);
    }

    public function createCustomer(StoreCustomerData $data): CustomerDto
    {
        $created = $this->customers->create($data->toArray());

        return CustomerDto::fromCustomer($created);
    }

    public function updateCustomer(Customer $customer, UpdateCustomerData $data): CustomerDto
    {
        $this->customers->update($customer, $data->toPayload());

        return CustomerDto::fromCustomer($customer->refresh());
    }

    public function deleteCustomer(Customer $customer): void
    {
        $this->customers->delete($customer);
    }
}
