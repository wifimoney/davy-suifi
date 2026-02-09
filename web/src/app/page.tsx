'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit';
import { useEffect, useState } from 'react';

const GIFS = [
    '/animations/pirate_v4_1.gif',
    '/animations/pirate_v4_2.gif',
    '/animations/pirate_v4_3.gif',
];

export default function LandingPage() {
    const account = useCurrentAccount();
    const router = useRouter();
    const [currentGifIndex, setCurrentGifIndex] = useState(0);

    // Automatically redirect to dashboard when wallet is connected
    useEffect(() => {
        if (account) {
            router.push('/dashboard');
        }
    }, [account, router]);

    // Background Gif Loop Timer
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentGifIndex((prev) => (prev + 1) % GIFS.length);
        }, 6000); // 6 seconds per gif
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative min-h-screen w-full bg-[#030303] flex items-center justify-center overflow-hidden">
            {/* Sequential Background Animations (16:9) */}
            <div className="absolute inset-0 z-0 flex items-center justify-center p-4 md:p-12">
                <div className="relative w-full max-w-6xl aspect-video overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_0_100px_rgba(34,211,238,0.05)]">
                    {GIFS.map((src, index) => (
                        <div
                            key={src}
                            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentGifIndex ? 'opacity-80' : 'opacity-0'
                                }`}
                        >
                            <Image
                                src={src}
                                alt={`Background Pirate ${index + 1}`}
                                fill
                                className="object-cover"
                                unoptimized
                            />
                        </div>
                    ))}
                    {/* Deeper vignette around edges (75%) */}
                    <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_160px_rgba(0,0,0,0.75)]" />
                </div>
            </div>

            {/* Content Layer: Perfectly Centered Symbol and Glitch Text */}
            <div className="relative z-20 flex flex-col items-center text-center px-4">
                {/* Central Symbol */}
                <div className="relative mb-12">
                    <div className="absolute -inset-10 bg-cyan-500/10 blur-[80px] rounded-full opacity-40 animate-pulse" />
                    <div className="relative transform transition-all duration-1000 hover:scale-105 drop-shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                        <Image
                            src="/logo.png"
                            alt="Davy Symbol"
                            width={320}
                            height={320}
                            className="w-64 h-64 md:w-80 md:h-80"
                            priority
                        />
                    </div>
                </div>

                {/* Glitch-capable tagline */}
                <div className="group cursor-default relative">
                    {/* The Glitch Effect Container */}
                    <div className="relative px-6 py-4 transition-all duration-300 transform group-hover:scale-[1.01]">
                        <p className="text-gray-200 font-sans text-lg md:text-xl leading-relaxed tracking-wide select-none group-hover:animate-glitch-text">
                            Professional trustless coordination on <strong>Sui</strong>. <br />
                            Trade with precision. Fill with intent.
                        </p>
                    </div>
                </div>

                {/* Entry Action */}
                <div className="mt-12">
                    <div className="p-[1px] bg-gradient-to-b from-white/20 to-transparent hover:from-cyan-500 shadow-2xl transition-all duration-500">
                        <div className="bg-[#030303] p-1">
                            <ConnectButton
                                connectText="INITIALIZE TERMINAL"
                                className="!bg-white !text-black !rounded-none !font-pixel !tracking-[0.3em] !font-bold !px-12 !py-6 hover:!bg-cyan-400 transition-all duration-300"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Pagination / Dots */}
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-4 z-10">
                {GIFS.map((_, i) => (
                    <div
                        key={i}
                        className={`h-1 transition-all duration-700 ${i === currentGifIndex ? 'w-12 bg-cyan-500' : 'w-2 bg-white/20'}`}
                    />
                ))}
            </div>

            {/* Static Overlays */}
            <div className="absolute bottom-8 left-10 z-20 text-[9px] font-pixel text-gray-500 uppercase tracking-widest opacity-40">
                LINK_STABILITY: OPTIMAL // NODE: SUI_TESTNET
            </div>
            <div className="absolute bottom-8 right-10 z-20 text-[9px] font-pixel text-gray-500 uppercase tracking-widest text-right opacity-40">
                DAVY_OS v1.0.4-α // AUTHORIZED_SESSION_ONLY
            </div>

            <style jsx global>{`
                @keyframes glitch-text {
                    0% { transform: translate(0); text-shadow: none; }
                    20% { transform: translate(-2px, 1px); text-shadow: 2px 0 #0ff, -2px 0 #f0f; }
                    40% { transform: translate(-2px, -1px); text-shadow: -2px 0 #0ff, 2px 0 #f0f; }
                    60% { transform: translate(2px, 1px); text-shadow: 2px 0 #0ff, -2px 0 #f0f; }
                    80% { transform: translate(2px, -1px); text-shadow: -2px 0 #0ff, 2px 0 #f0f; }
                    100% { transform: translate(0); text-shadow: none; }
                }
                .group:hover .animate-glitch-text {
                    animation: glitch-text 0.2s infinite linear;
                }
            `}</style>
        </div>
    );
}
