import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-global-loader',
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule],
  templateUrl: './global-loader.component.html',
  styleUrl: './global-loader.component.css',
})
export class GlobalLoaderComponent {
  private loading = inject(LoadingService);

  visible = computed(() => this.loading.isLoading());
}

