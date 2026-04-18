<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('non_fiscalized_companies', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('company_name', 255);
            $table->string('registration_number', 100)->unique();
            $table->string('tax_id', 50)->nullable()->index();
            $table->string('email', 255);
            $table->string('phone', 50);
            $table->text('physical_address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('country', 100);
            $table->string('postal_code', 20)->nullable();
            
            // Admin user details
            $table->string('admin_first_name', 100);
            $table->string('admin_last_name', 100);
            $table->string('admin_email', 255)->unique();
            $table->string('admin_phone', 50);
            $table->string('admin_password'); // Hashed password
            
            // Auth0 integration (optional, for future linking)
            $table->string('auth0_user_id', 100)->nullable()->unique();
            
            // Status and metadata
            $table->boolean('is_active')->default(true);
            $table->boolean('email_verified')->default(false);
            $table->timestamp('email_verified_at')->nullable();
            $table->string('verification_token', 100)->nullable();
            
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('email');
            $table->index('admin_email');
            $table->index('country');
            $table->index('is_active');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('non_fiscalized_companies');
    }
};
