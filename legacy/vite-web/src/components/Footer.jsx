// src/components/Footer.jsx

function Footer() {
  return (
    <footer>
      <p>
        <a href="/privacy.html" target="_blank" className="footer-link">
          개인정보 처리방침
        </a> | 
        <a href="/terms.html" target="_blank" className="footer-link">
          서비스 이용약관
        </a>
      </p>
      <p>Contact: <a href="mailto:1538iron@gmail.com">1538iron@gmail.com</a></p>
      <p>Copyright &copy; 2025 IronCPA. All Rights Reserved.</p>
    </footer>
  );
}

export default Footer;