<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Str;

class MakeFullModel extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'make:full-model {name}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Create model, migration, base repository, repository interface, Laravel Data DTO, and full CRUD controller';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $name = $this->argument('name');
        $modelName = Str::studly($name);
        $tableName = Str::snake(Str::pluralStudly($name));
        $repositoryName = $modelName.'Repository';
        $interfaceName = $repositoryName.'Interface';
        $dataName = $modelName.'Data';
        $controllerName = $modelName.'Controller';

        // Migration
        $this->call('make:migration', [
            'name' => 'create_'.$tableName.'_table',
            '--create' => $tableName,
        ]);

        // Model (WithData, Auditable, fillable)
        $modelPath = app_path('Models/'.$modelName.'.php');
        $this->call('make:model', [
            'name' => $modelName,
        ]);
        $modelStub = "<?php\n\nnamespace App\\Models;\n\nuse App\\Data\\{$dataName};\nuse Illuminate\\Database\\Eloquent\\Factories\\HasFactory;\nuse Illuminate\\Database\\Eloquent\\Model;\nuse OwenIt\\Auditing\\Contracts\\Auditable;\nuse Spatie\\LaravelData\\WithData;\n\nclass {$modelName} extends Model implements Auditable\n{\n    use HasFactory, \\OwenIt\\Auditing\\Auditable, WithData;\n\n    protected string \$dataClass = {$dataName}::class;\n\n    protected \$fillable = [\n        // Add fillable columns from migration\n    ];\n}\n";
        file_put_contents($modelPath, $modelStub);

        // Ensure base interface and base repository exist
        $this->ensureBaseRepositoryExists();

        // Repository Interface (extends RepositoryInterface)
        $interfacePath = app_path('Repositories/Interfaces/'.$interfaceName.'.php');
        if (!file_exists(dirname($interfacePath))) mkdir(dirname($interfacePath), 0755, true);
        file_put_contents($interfacePath, "<?php\n\nnamespace App\\Repositories\\Interfaces;\n\ninterface {$interfaceName} extends RepositoryInterface\n{\n}\n");

        // Repository Implementation (extends BaseRepository)
        $repoPath = app_path('Repositories/'.$repositoryName.'.php');
        if (!file_exists(dirname($repoPath))) mkdir(dirname($repoPath), 0755, true);
        $repoStub = "<?php\n\nnamespace App\\Repositories;\n\nuse App\\Models\\{$modelName};\nuse App\\Repositories\\Interfaces\\{$interfaceName};\n\nclass {$repositoryName} extends BaseRepository implements {$interfaceName}\n{\n    public function __construct()\n    {\n        parent::__construct({$modelName}::class);\n    }\n}\n";
        file_put_contents($repoPath, $repoStub);

        // Laravel Data DTO (camelCase properties + SnakeCaseMapper for input/output)
        $dataPath = app_path('Data/'.$dataName.'.php');
        if (!file_exists(dirname($dataPath))) mkdir(dirname($dataPath), 0755, true);
        $dataStub = "<?php\n\nnamespace App\\Data;\n\nuse Spatie\\LaravelData\\Attributes\\MapName;\nuse Spatie\\LaravelData\\Data;\nuse Spatie\\LaravelData\\Mappers\\SnakeCaseMapper;\n\n#[MapName(SnakeCaseMapper::class)]\nclass {$dataName} extends Data\n{\n    public function __construct(\n        // Define camelCase properties here\n    ) {}\n}\n";
        file_put_contents($dataPath, $dataStub);

        // Controller (full CRUD; concatenate so ->method() is not executed during interpolation)
        $controllerPath = app_path('Http/Controllers/'.$controllerName.'.php');
        if (!file_exists(dirname($controllerPath))) mkdir(dirname($controllerPath), 0755, true);
        $repoVar = 'repository';
        $controllerStub = "<?php\n\nnamespace App\\Http\\Controllers;\n\nuse App\\Repositories\\Interfaces\\{$interfaceName};\nuse Illuminate\\Http\\Request;\n\nclass {$controllerName} extends Controller\n{\n    public function __construct(\n        protected {$interfaceName} \${$repoVar}\n    ) {}\n\n    public function index()\n    {\n        return response()->json(\$this->{$repoVar}" . "->all());\n    }\n\n    public function show(string|int \$id)\n    {\n        \$model = \$this->{$repoVar}" . "->find(\$id);\n        if (!\$model) {\n            return response()->json(['message' => 'Not found'], 404);\n        }\n        return response()->json(\$model);\n    }\n\n    public function store(Request \$request)\n    {\n        \$model = \$this->{$repoVar}" . "->create(\$request->all());\n        return response()->json(\$model, 201);\n    }\n\n    public function update(Request \$request, string|int \$id)\n    {\n        \$model = \$this->{$repoVar}" . "->update(\$id, \$request->all());\n        return response()->json(\$model);\n    }\n\n    public function destroy(string|int \$id)\n    {\n        \$this->{$repoVar}" . "->delete(\$id);\n        return response()->json(null, 204);\n    }\n}\n";
        file_put_contents($controllerPath, $controllerStub);

        // Bind repository interface to implementation in AppServiceProvider
        $this->bindRepositoryInterface($interfaceName, $repositoryName);

        $this->info("Migration, model, repository + interface, Data DTO, full CRUD controller, and binding created for $modelName.");
    }

    protected function ensureBaseRepositoryExists(): void
    {
        $interfaceDir = app_path('Repositories/Interfaces');
        if (!file_exists($interfaceDir)) {
            mkdir($interfaceDir, 0755, true);
        }
        $baseInterfacePath = $interfaceDir . '/RepositoryInterface.php';
        if (!file_exists($baseInterfacePath)) {
            file_put_contents($baseInterfacePath, "<?php\n\nnamespace App\\Repositories\\Interfaces;\n\ninterface RepositoryInterface\n{\n    public function all(): \\Illuminate\\Database\\Eloquent\\Collection;\n\n    public function find(int|string \$id): ?\\Illuminate\\Database\\Eloquent\\Model;\n\n    public function create(array \$data): \\Illuminate\\Database\\Eloquent\\Model;\n\n    public function update(int|string \$id, array \$data): \\Illuminate\\Database\\Eloquent\\Model;\n\n    public function delete(int|string \$id): bool;\n}\n");
        }

        $baseRepoPath = app_path('Repositories/BaseRepository.php');
        if (!file_exists($baseRepoPath)) {
            file_put_contents($baseRepoPath, "<?php\n\nnamespace App\\Repositories;\n\nuse App\\Repositories\\Interfaces\\RepositoryInterface;\nuse Illuminate\\Database\\Eloquent\\Model;\n\nabstract class BaseRepository implements RepositoryInterface\n{\n    public function __construct(\n        protected string \$modelClass\n    ) {}\n\n    public function all(): \\Illuminate\\Database\\Eloquent\\Collection\n    {\n        return \$this->modelClass::all();\n    }\n\n    public function find(int|string \$id): ?Model\n    {\n        return \$this->modelClass::find(\$id);\n    }\n\n    public function create(array \$data): Model\n    {\n        return \$this->modelClass::create(\$data);\n    }\n\n    public function update(int|string \$id, array \$data): Model\n    {\n        \$model = \$this->modelClass::findOrFail(\$id);\n        \$model->update(\$data);\n        return \$model->fresh();\n    }\n\n    public function delete(int|string \$id): bool\n    {\n        return \$this->modelClass::findOrFail(\$id)->delete();\n    }\n}\n");
        }
    }

    protected function bindRepositoryInterface(string $interfaceName, string $repositoryName): void
    {
        $bindLine = "        \$this->app->bind(\\App\\Repositories\\Interfaces\\{$interfaceName}::class, \\App\\Repositories\\{$repositoryName}::class);";

        $providerPath = app_path('Providers/AppServiceProvider.php');
        $content = file_get_contents($providerPath);

        if (str_contains($content, "{$interfaceName}::class")) {
            return;
        }

        $emptyRegister = "        //\n    }\n\n    /**";
        $withBinding = "        //\n" . $bindLine . "\n    }\n\n    /**";
        $closingBrace = "    }\n\n    /**";

        if (str_contains($content, $emptyRegister)) {
            $content = str_replace($emptyRegister, $withBinding, $content);
            file_put_contents($providerPath, $content);
        } else {
            $pos = strpos($content, $closingBrace);
            if ($pos !== false) {
                $content = substr_replace($content, "\n" . $bindLine . "\n    " . $closingBrace, $pos, strlen($closingBrace));
                file_put_contents($providerPath, $content);
            }
        }
    }
}
