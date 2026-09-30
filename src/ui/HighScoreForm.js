// The DOM initials form shown for a qualifying score. Owns all DOM access for the form.
export class HighScoreForm {
  constructor({ onSubmit, onSkip }) {
    this.root = document.getElementById('highscore-form');
    this.input = document.getElementById('initials');
    this.submitButton = this.root.querySelector('.submit-btn');
    this.skipButton = this.root.querySelector('.skip-btn');

    this.handleSubmitClick = () => onSubmit(this.input.value);
    this.handleSkipClick = () => onSkip();
    // Enter in the input submits
    this.handleInputKeydown = (event) => {
      if (event.key === 'Enter') {
        onSubmit(this.input.value);
      }
    };
    // Escape skips, but only while the form is visible
    this.handleDocumentKeydown = (event) => {
      if (this.isVisible() && event.key === 'Escape') {
        onSkip();
      }
    };

    this.submitButton.addEventListener('click', this.handleSubmitClick);
    this.skipButton.addEventListener('click', this.handleSkipClick);
    this.input.addEventListener('keydown', this.handleInputKeydown);
    document.addEventListener('keydown', this.handleDocumentKeydown);
  }

  isVisible() {
    return this.root.style.display === 'block';
  }

  show() {
    this.root.style.display = 'block';
    this.input.value = '';
    this.input.focus();
  }

  hide() {
    this.root.style.display = 'none';
  }

  destroy() {
    this.submitButton.removeEventListener('click', this.handleSubmitClick);
    this.skipButton.removeEventListener('click', this.handleSkipClick);
    this.input.removeEventListener('keydown', this.handleInputKeydown);
    document.removeEventListener('keydown', this.handleDocumentKeydown);
  }
}
