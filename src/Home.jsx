import React, { useState } from "react";
import { TiTick } from "react-icons/ti";
import { FaRegCopyright } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

const Home = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')

  const handleBuy = (path) => {
    if (user) {
      navigate(path)
    } else {
      setNotice('Login or sign up to continue')
      setTimeout(() => setNotice(''), 3000)
    }
  }

  return (
    <div className="flex justify-center items-center flex-col mt-8 ">
      <div className="flex text-center flex-col">
        <h4 className="text-3xl lg:text-4xl font-bold">Your most Trusted</h4>
        <h4 className="text-3xl lg:text-4xl font-bold text-blue-500">
          Affordable Data Plug
        </h4>
      </div>
      <div className="flex text-center mt-5">
        <p className="lg:text-lg">
          Welcome to PulseMart.
          <br />
          Get high-quality and affordable data bundles
          <br /> delivered instantly anytime,anywhere
          <br /> "Fast.Reliable.Affordable-All in one Place"
        </p>
      </div>
      <div className="font-bold text-2xl mt-8">
        <h3>Select your Provider</h3>
      </div >
      {notice && (
        <div className="w-full max-w-4xl mx-auto px-4">
          <div className="bg-red-100 text-red-800 p-2 rounded mt-4 mb-2 text-center">{notice}</div>
        </div>
      )}
      <div className="lg:flex lg:justify-center lg:items-center gap-8">
        <div >
        <div className="card bg-base-100 w-76 shadow-sm m-4 hover:shadow-lg transition-shadow duration-300 hover:bg-yellow-50">
          <figure>
            <img
              src="/src/assets/mtn.jpg"
              alt="mtn"
              className="w-25 h-24 mt-2"
            />
          </figure>
          <div className="card-body">
            <h2 className="card-title justify-center">MTN Bundles</h2>
            <div>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                No Expiry
              </p>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                Affordable Plans
              </p>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                Fast Delivery
              </p>
            </div>
          </div>
          <div>
            <div className="card-actions justify-center mb-4">
              <button onClick={() => handleBuy('/mtn')} className="btn btn-primary">Buy Now</button>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="card bg-base-100 w-76 shadow-sm m-4 hover:shadow-lg transition-shadow duration-300 hover:bg-red-50">
          <figure>
            <img
              src="/src/assets/telecel.png"
              alt="telecel"
              className="w-25 h-24 mt-2"
            />
          </figure>
          <div className="card-body">
            <h2 className="card-title justify-center">Telecel Bundles</h2>
            <div>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                No Expiry
              </p>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                Affordable Plans
              </p>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                Fast Delivery
              </p>
            </div>
          </div>
          <div>
            <div className="card-actions justify-center mb-4">
              <button onClick={() => handleBuy('/telecel')} className="btn btn-primary">Buy Now</button>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="card bg-base-100 w-76 shadow-sm m-4 hover:shadow-lg transition-shadow duration-300 hover:bg-blue-50">
          <figure>
            <img
              src="/src/assets/AT.png"
              alt="mtn"
              className="w-25 h-24 mt-2"
            />
          </figure>
          <div className="card-body">
            <h2 className="card-title justify-center">Airtel Tigo Bundles</h2>
            <div>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                No Expiry
              </p>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                Affordable Plans
              </p>
              <p className="flex items-center gap-2">
                <TiTick className="text-blue-500" />
                Fast Delivery
              </p>
            </div>
          </div>
          <div>
            <div className="card-actions justify-center mb-4">
              <button onClick={() => handleBuy('/airteltigo')} className="btn btn-primary">Buy Now</button>
            </div>
          </div>
        </div>
      </div>
      
      </div>

      <hr className="w-3/4 mt-8" />
      
      <div className="flex mb-4 mt-8">
         <p><FaRegCopyright className="inline-block" /> 2025 PulseMart. All rights reserved.</p>

      </div>
     
    </div>
  );
};

export default Home;
