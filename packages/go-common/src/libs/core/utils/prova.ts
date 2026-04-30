export class ProvaProvider {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  prova(): string {
    return 'prova';
  }
}
