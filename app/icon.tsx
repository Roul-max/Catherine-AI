import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{
          color: 'white',
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: -1,
        }}>
          C
        </div>
      </div>
    ),
    { ...size }
  )
}