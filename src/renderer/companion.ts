import './styles/main.css';

const shell = document.querySelector<HTMLElement>('.companion-shell');

let t = 0;
function animate() {
  t += 0.016;
  if (shell) {
    shell.style.transform = `translateY(${Math.sin(t * 3) * 5}px) rotate(${Math.sin(t * 1.4) * 2}deg)`;
    shell.style.filter = `drop-shadow(0 14px 28px rgba(0,0,0,.34)) saturate(${1 + Math.sin(t * 0.8) * 0.08})`;
  }
  requestAnimationFrame(animate);
}

animate();
