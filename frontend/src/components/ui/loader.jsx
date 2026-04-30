export function LoaderThree() {
  return (
    <>
      <style>{`
        .loader-three { display: inline-flex; align-items: center; gap: 5px; }
        .loader-three span {
          width: 7px; height: 7px; border-radius: 50%;
          background: currentColor; opacity: 0.8;
          animation: loader-three-bounce 1.2s ease-in-out infinite;
        }
        .loader-three span:nth-child(2) { animation-delay: 0.2s; }
        .loader-three span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes loader-three-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
      `}</style>
      <span className="loader-three">
        <span /><span /><span />
      </span>
    </>
  )
}
