import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FiscalizationDialogComponent } from './components/fiscalization-dialog/fiscalization-dialog.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, FiscalizationDialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
